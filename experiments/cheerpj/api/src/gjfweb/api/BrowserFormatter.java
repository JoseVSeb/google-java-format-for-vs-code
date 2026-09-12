package gjfweb.api;

import com.google.googlejavaformat.java.Formatter;
import com.google.googlejavaformat.java.FormatterException;
import com.google.googlejavaformat.java.ImportOrderer;
import com.google.googlejavaformat.java.JavaFormatterOptions;
import com.google.googlejavaformat.java.JavaFormatterOptions.Style;
import com.google.googlejavaformat.java.RemoveUnusedImports;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

/**
 * The entry point JavaScript calls through CheerpJ.
 *
 * <p>CheerpJ's library mode maps Java statics onto JavaScript promises, so the surface is kept to
 * static methods taking strings and booleans. {@link #format} answers with a small JSON document
 * rather than throwing, because a rejected promise carries a Java exception that is awkward to
 * inspect from JavaScript.
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
     */
    public static String format(
            String source, String style, boolean fixImports, boolean formatJavadoc, boolean reorderModifiers) {
        try {
            return "{\"ok\":true,\"output\":"
                    + quote(formatOrThrow(source, style, fixImports, formatJavadoc, reorderModifiers))
                    + "}";
        } catch (FormatterException e) {
            return "{\"ok\":false,\"error\":" + quote(String.valueOf(e.getMessage())) + "}";
        } catch (RuntimeException e) {
            return "{\"ok\":false,\"error\":" + quote(e + "") + "}";
        }
    }

    /**
     * Formats with google-java-format's defaults: Google style, imports fixed.
     *
     * <p>Deliberately not an overload of {@link #format}: CheerpJ picks an overload from the
     * JavaScript call, and two same-named entry points make that guess load-bearing.
     */
    public static String formatDefault(String source) {
        return format(source, "GOOGLE", true, false, true);
    }

    /** Same as {@link #format} but propagates google-java-format's own exception. */
    public static String formatOrThrow(
            String source, String style, boolean fixImports, boolean formatJavadoc, boolean reorderModifiers)
            throws FormatterException {
        Style parsedStyle = "AOSP".equalsIgnoreCase(style) ? Style.AOSP : Style.GOOGLE;
        JavaFormatterOptions options = JavaFormatterOptions.builder()
                .style(parsedStyle)
                .formatJavadoc(formatJavadoc)
                .reorderModifiers(reorderModifiers)
                .build();
        String result = source;
        if (fixImports) {
            result = RemoveUnusedImports.removeUnusedImports(result);
            result = ImportOrderer.reorderImports(result, parsedStyle);
        }
        return new Formatter(options).formatSource(result);
    }

    /** The google-java-format release this bundle was built from. */
    public static String version() {
        try (java.io.InputStream in = BrowserFormatter.class.getResourceAsStream("/gjfweb/gjf-version.txt")) {
            return in == null ? "unknown" : new String(in.readAllBytes(), StandardCharsets.UTF_8).trim();
        } catch (IOException e) {
            return "unknown";
        }
    }

    /**
     * Command line entry point, used by the build's verification step and available as a {@code
     * cheerpjRunMain} fallback: formats each file argument and writes the result to standard out.
     */
    public static void main(String[] args) throws IOException, FormatterException {
        boolean aosp = false;
        boolean fixImports = true;
        StringBuilder out = new StringBuilder();
        for (String arg : args) {
            if (arg.equals("--aosp")) {
                aosp = true;
            } else if (arg.equals("--skip-sorting-imports")) {
                fixImports = false;
            } else {
                String source = new String(Files.readAllBytes(Paths.get(arg)), StandardCharsets.UTF_8);
                out.append(formatOrThrow(source, aosp ? "AOSP" : "GOOGLE", fixImports, false, true));
            }
        }
        System.out.print(out);
        System.out.flush();
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
