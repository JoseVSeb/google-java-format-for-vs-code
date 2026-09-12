package probe;

import gjfwasm.Main;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

/**
 * Measures the two runtime behaviours a WebAssembly target restricts: threads and file access.
 *
 * <p>Web Image has no native threads, and a browser gives a Wasm module no real filesystem. If
 * google-java-format's format path needed either, the whole approach would be a dead end, so this
 * measures rather than assumes. Thread counts are printed here; file access is observed from
 * outside by {@code probe.sh}, which traces the process.
 */
public final class RuntimeShapeProbe {

    public static void main(String[] args) throws Exception {
        String source = new String(Files.readAllBytes(Paths.get(args[0])), StandardCharsets.UTF_8);

        int before = Thread.getAllStackTraces().size();
        String formatted = Main.format(source, "GOOGLE", true, true, true, true, 0, 0);
        int after = Thread.getAllStackTraces().size();

        System.out.println("input:           " + args[0]);
        System.out.println("formatted chars: " + formatted.length());
        System.out.println("live threads:    " + before + " before, " + after + " after");
        Thread.getAllStackTraces().keySet().stream()
                .map(Thread::getName)
                .sorted()
                .forEach(name -> System.out.println("  " + name));
    }

    private RuntimeShapeProbe() {}
}
