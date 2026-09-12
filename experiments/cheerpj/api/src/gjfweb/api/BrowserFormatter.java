package gjfweb.api;

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
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

/**
 * The entry point JavaScript calls through CheerpJ.
 *
 * <p>The pipeline mirrors google-java-format's own command line driver: format the selected
 * character ranges, then fix imports, then reflow long strings. Same order, same defaults, so the
 * browser answers with what the extension's native binary would answer today.
 *
 * <p>CheerpJ's library mode maps Java statics onto JavaScript promises, so the surface is static
 * methods taking strings, booleans and ints, with no overloads for CheerpJ to choose between.
 * {@link #format} answers with a small JSON document rather than throwing, because a rejected
 * promise carries a Java exception that is awkward to inspect from JavaScript.
 */
public final class BrowserFormatter {

    private BrowserFormatter() {}

    /**
     * Formats {@code source} and returns {@code {"ok":true,"output":"..."}}, or {@code
     * {"ok":false,"error":"..."}} when the source cannot be parsed.
     *
     * @param style either {@code "GOOGLE"} or {@code "AOSP"}
     * @param fixImports remove unused imports and sort the remaining ones
     * @param formatJavadoc reflow javadoc comments
     * @param reorderModifiers sort modifiers into canonical order
     * @param reflowLongStrings wrap long string literals
     * @param startLine first line to format, 1-based and inclusive; 0 formats the whole file
     * @param endLine last line to format, 1-based and inclusive; 0 formats the whole file
     */
    public static String format(
            String source,
            String style,
            boolean fixImports,
            boolean formatJavadoc,
            boolean reorderModifiers,
            boolean reflowLongStrings,
            int startLine,
            int endLine) {
        try {
            String output = formatOrThrow(
                    source, style, fixImports, formatJavadoc, reorderModifiers, reflowLongStrings, startLine, endLine);
            return "{\"ok\":true,\"output\":" + quote(output) + "}";
        } catch (FormatterException e) {
            return "{\"ok\":false,\"error\":" + quote(String.valueOf(e.getMessage())) + "}";
        } catch (RuntimeException e) {
            return "{\"ok\":false,\"error\":" + quote(e + "") + "}";
        }
    }

    /** Formats a whole file with the command line driver's defaults. */
    public static String formatDefault(String source) {
        return format(source, "GOOGLE", true, true, true, true, 0, 0);
    }

    /** Same as {@link #format} but propagates google-java-format's own exception. */
    public static String formatOrThrow(
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

    /** The google-java-format release this bundle was built from. */
    public static String version() {
        try (InputStream in = BrowserFormatter.class.getResourceAsStream("/gjfweb/gjf-version.txt")) {
            return in == null ? "unknown" : new String(in.readAllBytes(), StandardCharsets.UTF_8).trim();
        } catch (IOException e) {
            return "unknown";
        }
    }

    /**
     * Command line entry point, used by the build's verification step and available as a {@code
     * cheerpjRunMain} fallback. Accepts the subset of google-java-format's flags the browser API
     * exposes, so its output can be diffed against the official jar's.
     */
    public static void main(String[] args) throws IOException, FormatterException {
        String style = "GOOGLE";
        boolean fixImports = true;
        boolean sortImports = true;
        boolean formatJavadoc = true;
        boolean reorderModifiers = true;
        boolean reflowLongStrings = true;
        int startLine = 0;
        int endLine = 0;
        StringBuilder out = new StringBuilder();

        for (int i = 0; i < args.length; i++) {
            String arg = args[i];
            switch (arg) {
                case "--aosp", "-aosp", "-a" -> style = "AOSP";
                case "--skip-removing-unused-imports" -> fixImports = false;
                case "--skip-sorting-imports" -> sortImports = false;
                case "--skip-javadoc-formatting" -> formatJavadoc = false;
                case "--skip-reflowing-long-strings" -> reflowLongStrings = false;
                case "--lines", "-lines", "--line", "-line" -> {
                    String[] range = args[++i].split(":", 2);
                    startLine = Integer.parseInt(range[0]);
                    endLine = Integer.parseInt(range[range.length - 1]);
                }
                default -> {
                    String source = new String(Files.readAllBytes(Paths.get(arg)), StandardCharsets.UTF_8);
                    out.append(formatOrThrow(
                            source,
                            style,
                            fixImports && sortImports,
                            formatJavadoc,
                            reorderModifiers,
                            reflowLongStrings,
                            startLine,
                            endLine));
                }
            }
        }
        // Write UTF-8 explicitly. The default stdout charset follows the platform locale,
        // which mangles non-ASCII source; the official driver writes UTF-8 the same way.
        System.out.write(out.toString().getBytes(StandardCharsets.UTF_8));
        System.out.flush();
    }

    /** Mirrors the driver's line handling: 1-based inclusive lines, 0 meaning the whole file. */
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

    private static String quote(String value) {
        StringBuilder sb = new StringBuilder(value.length() + 16).append('"');
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
                }
            }
        }
        return sb.append('"').toString();
    }
}
