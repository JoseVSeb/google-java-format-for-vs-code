package gjfcheerpj.verify;

import com.google.googlejavaformat.java.Formatter;
import com.google.googlejavaformat.java.FormatterException;
import com.google.googlejavaformat.java.ImportOrderer;
import com.google.googlejavaformat.java.JavaFormatterOptions;
import com.google.googlejavaformat.java.RemoveUnusedImports;
import com.google.googlejavaformat.java.StringWrapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

/**
 * Formats a corpus of Java files and writes one output file per input.
 *
 * <p>It is compiled twice from this one source: against the official google-java-format release (run
 * on a JDK 21 JVM) and against the browser bundle (run on a JDK 17 JVM). Comparing the two output
 * directories shows whether relocating and retargeting the release changed any formatting decision.
 */
public final class CorpusRunner {

    public static void main(String[] args) throws IOException {
        Path outDir = Paths.get(args[0]);
        Path listFile = Paths.get(args[1]);
        Files.createDirectories(outDir);

        List<String> inputs = Files.readAllLines(listFile);
        int ok = 0;
        int failed = 0;
        for (String input : inputs) {
            Path path = Paths.get(input);
            String source = new String(Files.readAllBytes(path), StandardCharsets.UTF_8);
            Path out = outDir.resolve(path.getFileName() + "." + Integer.toHexString(input.hashCode()));
            try {
                // google-java-format's own driver order: format, fix imports, reflow strings.
                Formatter formatter = new Formatter();
                String result = formatter.formatSource(source);
                result = RemoveUnusedImports.removeUnusedImports(result);
                result = ImportOrderer.reorderImports(result, JavaFormatterOptions.Style.GOOGLE);
                result = StringWrapper.wrap(result, formatter);
                Files.write(out, result.getBytes(StandardCharsets.UTF_8));
                ok++;
            } catch (FormatterException e) {
                Files.write(
                        out,
                        ("FORMATTER-ERROR: " + e.getMessage()).getBytes(StandardCharsets.UTF_8));
                failed++;
            } catch (RuntimeException | StackOverflowError e) {
                Files.write(out, ("RUNTIME-ERROR: " + e).getBytes(StandardCharsets.UTF_8));
                failed++;
            }
        }
        System.out.println("formatted " + ok + " file(s), " + failed + " rejected");
    }

    private CorpusRunner() {}
}
