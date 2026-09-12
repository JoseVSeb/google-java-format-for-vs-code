package gjfwasm;

import com.google.common.collect.Range;
import com.google.common.collect.RangeSet;
import com.google.common.collect.TreeRangeSet;
import com.google.googlejavaformat.java.Formatter;
import com.google.googlejavaformat.java.FormatterException;
import com.google.googlejavaformat.java.ImportOrderer;
import com.google.googlejavaformat.java.JavaFormatterOptions;
import com.google.googlejavaformat.java.JavaFormatterOptions.Style;
import com.google.googlejavaformat.java.RemoveUnusedImports;
import com.google.googlejavaformat.java.StringWrapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

/**
 * Entry point for the WebAssembly image.
 *
 * <p>It calls google-java-format's public API in the order its own command line driver uses, and
 * deliberately nothing else: no threads, no temporary files, no file manager. Those are the two
 * things a Web Image target restricts, and the probe in {@code probe/} measures that the format
 * path stays inside those limits.
 *
 * <p>Input arrives as a file path or on standard input, and the result goes to standard output as
 * UTF-8. That is the lowest common denominator across native, Node and browser targets; a richer
 * JavaScript-facing API belongs after the first image builds, when the wrapper's interop surface
 * can be seen rather than guessed at.
 */
public final class Main {

    private Main() {}

    public static void main(String[] args) throws IOException {
        String style = "GOOGLE";
        boolean fixImports = true;
        boolean formatJavadoc = true;
        boolean reorderModifiers = true;
        boolean reflowLongStrings = true;
        int startLine = 0;
        int endLine = 0;
        String source = null;

        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--aosp", "-aosp", "-a" -> style = "AOSP";
                case "--skip-sorting-imports", "--skip-removing-unused-imports" -> fixImports = false;
                case "--skip-javadoc-formatting" -> formatJavadoc = false;
                case "--skip-reflowing-long-strings" -> reflowLongStrings = false;
                case "--lines", "-lines", "--line", "-line" -> {
                    String[] range = args[++i].split(":", 2);
                    startLine = Integer.parseInt(range[0]);
                    endLine = Integer.parseInt(range[range.length - 1]);
                }
                // The Wasm runtime has no standard input and no host filesystem, so the source
                // is passed inline. Reading a file still works natively and under Node's shim.
                case "--code" -> source = args[++i];
                case "-", "--stdin" -> source = new String(System.in.readAllBytes(), StandardCharsets.UTF_8);
                default -> source = new String(Files.readAllBytes(Paths.get(args[i])), StandardCharsets.UTF_8);
            }
        }
        if (source == null) {
            source = new String(System.in.readAllBytes(), StandardCharsets.UTF_8);
        }

        try {
            String formatted =
                    format(source, style, fixImports, formatJavadoc, reorderModifiers, reflowLongStrings, startLine, endLine);
            // Explicit UTF-8: the default stdout charset follows the platform locale.
            System.out.write(formatted.getBytes(StandardCharsets.UTF_8));
            System.out.flush();
        } catch (FormatterException e) {
            System.err.println(e.getMessage());
            System.exit(1);
        }
    }

    public static String format(
            String source,
            String style,
            boolean fixImports,
            boolean formatJavadoc,
            boolean reorderModifiers,
            boolean reflowLongStrings,
            int startLine,
            int endLine)
            throws FormatterException {
        Style parsedStyle = "AOSP".equalsIgnoreCase(style) ? Style.AOSP : Style.GOOGLE;
        JavaFormatterOptions options = JavaFormatterOptions.builder()
                .style(parsedStyle)
                .formatJavadoc(formatJavadoc)
                .reorderModifiers(reorderModifiers)
                .build();

        Formatter formatter = new Formatter(options);
        String result = formatter.formatSource(source, characterRanges(source, startLine, endLine).asRanges());
        if (fixImports) {
            result = RemoveUnusedImports.removeUnusedImports(result);
            result = ImportOrderer.reorderImports(result, parsedStyle);
        }
        if (reflowLongStrings) {
            result = StringWrapper.wrap(result, formatter);
        }
        return result;
    }

    /** 1-based inclusive lines, as the driver takes them; 0 means the whole file. */
    private static RangeSet<Integer> characterRanges(String source, int startLine, int endLine) {
        RangeSet<Integer> ranges = TreeRangeSet.create();
        if (startLine <= 0 || endLine <= 0) {
            ranges.add(Range.closedOpen(0, source.length()));
            return ranges;
        }
        RangeSet<Integer> lines = TreeRangeSet.create();
        lines.add(Range.closedOpen(startLine - 1, endLine));
        ranges.addAll(Formatter.lineRangesToCharRanges(source, lines));
        return ranges;
    }
}
