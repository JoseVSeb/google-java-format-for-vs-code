package gjfcheerpj.build;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.jar.Attributes;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;
import java.util.jar.JarOutputStream;
import java.util.jar.Manifest;
import java.util.zip.Deflater;
import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassVisitor;
import org.objectweb.asm.ClassWriter;
import org.objectweb.asm.FieldVisitor;
import org.objectweb.asm.Handle;
import org.objectweb.asm.MethodVisitor;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.commons.ClassRemapper;
import org.objectweb.asm.commons.Remapper;

/**
 * Builds a single self-contained jar that runs an unmodified google-java-format release on a JVM
 * that only implements an older Java release (CheerpJ currently tops out at Java 17).
 *
 * <p>Three transformations are applied to every class that goes into the bundle:
 *
 * <ol>
 *   <li><b>Relocation.</b> The JDK's compiler packages ({@code com.sun.tools.javac}, {@code
 *       com.sun.source}, {@code javax.lang.model}, {@code javax.tools}, ...) are moved under a
 *       private prefix and google-java-format's references to them are rewritten to match. The
 *       bundled compiler therefore cannot be shadowed by, or clash with, whatever {@code
 *       jdk.compiler} the host JVM ships, and no {@code --add-exports} flags are needed because
 *       nothing lives in a named module any more.
 *   <li><b>Retargeting.</b> Class files newer than the target release are rewritten to the target
 *       class file version.
 *   <li><b>Bootstrap rewriting.</b> {@code invokedynamic} instructions bootstrapped by {@code
 *       java.lang.runtime.SwitchBootstraps} (pattern-matching switch, final in Java 21) are
 *       redirected to {@link gjfweb.runtime.SwitchShim}, which implements the same semantics with
 *       Java 17 APIs.
 * </ol>
 */
public final class BundleBuilder {

    /** Packages taken from the JDK image and hidden under {@link #prefix}. */
    private static final List<String> RELOCATED_ROOTS = List.of(
            "com/sun/tools/javac/",
            "com/sun/tools/doclint/",
            "com/sun/tools/sjavac/",
            "com/sun/source/",
            "jdk/internal/opt/",
            "javax/lang/model/",
            "javax/annotation/processing/",
            "javax/tools/");

    /** JDK image packages that only serve jshell//the source launcher and drag in JDK internals. */
    private static final List<String> DROPPED_ROOTS =
            List.of("jdk/internal/shellsupport/", "com/sun/tools/javac/launcher/");

    private static final String SWITCH_BOOTSTRAPS = "java/lang/runtime/SwitchBootstraps";
    private static final String SWITCH_SHIM = "gjfweb/runtime/SwitchShim";

    /**
     * Platform classes that only exist on the newer release, mapped onto stand-ins compiled for the
     * target release. {@code java.lang} is a restricted package, so the originals cannot be shipped
     * under their own names.
     */
    private static final Map<String, String> SUBSTITUTED_CLASSES =
            Map.of("java/lang/MatchException", "gjfweb/runtime/MatchException");

    /**
     * Instance methods added after the target release, mapped onto static stand-ins that take the
     * receiver as their first argument. Keys are {@code owner#name+descriptor} as written at the call
     * site; values are {@code owner name descriptor} of the replacement.
     */
    private static final Map<String, String> SUBSTITUTED_METHODS = Map.of(
            "java/lang/StringBuilder#repeat(II)Ljava/lang/StringBuilder;",
                    "gjfweb/runtime/ApiShims stringBuilderRepeat (Ljava/lang/StringBuilder;II)Ljava/lang/StringBuilder;",
            "java/util/List#getFirst()Ljava/lang/Object;",
                    "gjfweb/runtime/ApiShims listGetFirst (Ljava/util/List;)Ljava/lang/Object;",
            "java/util/List#getLast()Ljava/lang/Object;",
                    "gjfweb/runtime/ApiShims listGetLast (Ljava/util/List;)Ljava/lang/Object;",
            "java/util/List#addFirst(Ljava/lang/Object;)V",
                    "gjfweb/runtime/ApiShims listAddFirst (Ljava/util/List;Ljava/lang/Object;)V",
            "java/util/List#addLast(Ljava/lang/Object;)V",
                    "gjfweb/runtime/ApiShims listAddLast (Ljava/util/List;Ljava/lang/Object;)V");

    private final String prefix;
    private final int targetVersion;
    private final Map<String, byte[]> entries = new TreeMap<>();
    private final Map<String, Integer> retargeted = new LinkedHashMap<>();
    private int relocatedClasses;
    private int rewrittenSwitches;
    private int substitutedClasses;
    private int substitutedMethods;

    private BundleBuilder(String prefix, int targetVersion) {
        this.prefix = prefix;
        this.targetVersion = targetVersion;
    }

    public static void main(String[] args) throws Exception {
        List<Path> jars = new ArrayList<>();
        List<Path> dirs = new ArrayList<>();
        Path out = null;
        String prefix = "gjfweb/shaded/";
        int target = Opcodes.V17;
        String mainClass = null;

        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--jar" -> jars.add(Paths.get(args[++i]));
                case "--dir" -> dirs.add(Paths.get(args[++i]));
                case "--out" -> out = Paths.get(args[++i]);
                case "--prefix" -> prefix = args[++i];
                case "--target" -> target = Integer.parseInt(args[++i]);
                case "--main-class" -> mainClass = args[++i];
                default -> throw new IllegalArgumentException("unknown option: " + args[i]);
            }
        }
        if (out == null || (jars.isEmpty() && dirs.isEmpty())) {
            throw new IllegalArgumentException("usage: BundleBuilder --jar <jar> --dir <dir> --out <jar>");
        }

        BundleBuilder builder = new BundleBuilder(prefix, target);
        for (Path jar : jars) {
            builder.addJar(jar);
        }
        for (Path dir : dirs) {
            builder.addDirectory(dir);
        }
        builder.write(out, mainClass);
        builder.report(out);
    }

    private void addJar(Path jar) throws IOException {
        try (JarFile file = new JarFile(jar.toFile())) {
            file.stream().filter(entry -> !entry.isDirectory()).forEach(entry -> {
                try (InputStream in = file.getInputStream(entry)) {
                    add(entry.getName(), in.readAllBytes());
                } catch (IOException e) {
                    throw new UncheckedIOException(e);
                }
            });
        }
    }

    private void addDirectory(Path dir) throws IOException {
        Files.walkFileTree(dir, new SimpleFileVisitor<Path>() {
            @Override
            public FileVisitResult visitFile(Path path, BasicFileAttributes attrs) throws IOException {
                add(dir.relativize(path).toString().replace('\\', '/'), Files.readAllBytes(path));
                return FileVisitResult.CONTINUE;
            }
        });
    }

    private void add(String name, byte[] bytes) {
        if (name.equals("module-info.class")
                || name.endsWith("/module-info.class")
                || name.startsWith("META-INF/MANIFEST.MF")
                || name.startsWith("META-INF/versions/")
                || name.endsWith(".SF")
                || name.endsWith(".RSA")
                || name.endsWith(".DSA")) {
            return;
        }
        if (isDropped(name)) {
            return;
        }
        if (name.endsWith(".class")) {
            byte[] transformed = transform(bytes);
            entries.put(mapResourceName(name), transformed);
            return;
        }
        if (name.startsWith("META-INF/services/")) {
            String service = name.substring("META-INF/services/".length());
            String mapped = "META-INF/services/" + mapClassName(service);
            entries.put(mapped, mapText(new String(bytes, StandardCharsets.UTF_8)).getBytes(StandardCharsets.UTF_8));
            return;
        }
        entries.put(mapResourceName(name), bytes);
    }

    private boolean isDropped(String name) {
        for (String dropped : DROPPED_ROOTS) {
            if (name.startsWith(dropped)) {
                return true;
            }
        }
        return false;
    }

    private byte[] transform(byte[] bytes) {
        ClassReader reader = new ClassReader(bytes);
        ClassWriter writer = new ClassWriter(0);
        ClassVisitor visitor = new ClassRemapper(new RetargetingVisitor(writer), new PackageRemapper());
        reader.accept(visitor, 0);
        return writer.toByteArray();
    }

    /** Lowers the class file version and redirects Java 21 switch bootstraps to the shim. */
    private final class RetargetingVisitor extends ClassVisitor {

        private RetargetingVisitor(ClassVisitor delegate) {
            super(Opcodes.ASM9, delegate);
        }

        @Override
        public void visit(int version, int access, String name, String signature, String superName, String[] ifaces) {
            int major = version & 0xFFFF;
            if (major > targetVersion) {
                retargeted.merge(major + " -> " + targetVersion, 1, Integer::sum);
                version = targetVersion;
            }
            super.visit(version, access, name, signature, superName, ifaces);
        }

        @Override
        public FieldVisitor visitField(
                int access, String name, String descriptor, String signature, Object value) {
            // Constants such as ToolProvider.DEFAULT_JAVAC_NAME name a relocated class as text.
            return super.visitField(
                    access, name, descriptor, signature, value instanceof String ? mapText((String) value) : value);
        }

        @Override
        public MethodVisitor visitMethod(
                int access, String name, String descriptor, String signature, String[] exceptions) {
            MethodVisitor delegate = super.visitMethod(access, name, descriptor, signature, exceptions);
            return delegate == null ? null : new MethodVisitor(Opcodes.ASM9, delegate) {
                @Override
                public void visitInvokeDynamicInsn(
                        String name, String descriptor, Handle bootstrap, Object... bootstrapArgs) {
                    if (SWITCH_BOOTSTRAPS.equals(bootstrap.getOwner())) {
                        rewrittenSwitches++;
                        bootstrap = new Handle(
                                Opcodes.H_INVOKESTATIC,
                                SWITCH_SHIM,
                                bootstrap.getName(),
                                bootstrap.getDesc(),
                                false);
                    }
                    super.visitInvokeDynamicInsn(name, descriptor, bootstrap, bootstrapArgs);
                }

                @Override
                public void visitMethodInsn(
                        int opcode, String owner, String name, String descriptor, boolean isInterface) {
                    String replacement = SUBSTITUTED_METHODS.get(owner + "#" + name + descriptor);
                    if (replacement != null
                            && (opcode == Opcodes.INVOKEVIRTUAL || opcode == Opcodes.INVOKEINTERFACE)) {
                        String[] parts = replacement.split(" ");
                        substitutedMethods++;
                        super.visitMethodInsn(Opcodes.INVOKESTATIC, parts[0], parts[1], parts[2], false);
                        return;
                    }
                    super.visitMethodInsn(opcode, owner, name, descriptor, isInterface);
                }

                @Override
                public void visitLdcInsn(Object value) {
                    super.visitLdcInsn(value instanceof String ? mapText((String) value) : value);
                }
            };
        }
    }

    /** Moves the JDK compiler packages under the private prefix. */
    private final class PackageRemapper extends Remapper {
        @Override
        public String map(String internalName) {
            String substitute = SUBSTITUTED_CLASSES.get(internalName);
            if (substitute != null) {
                substitutedClasses++;
                return substitute;
            }
            for (String root : RELOCATED_ROOTS) {
                if (internalName.startsWith(root)) {
                    relocatedClasses++;
                    return prefix + internalName;
                }
            }
            return internalName;
        }
    }

    private String mapResourceName(String name) {
        for (String root : RELOCATED_ROOTS) {
            if (name.startsWith(root)) {
                return prefix + name;
            }
        }
        return name;
    }

    private String mapClassName(String dotted) {
        for (String root : RELOCATED_ROOTS) {
            String dottedRoot = root.replace('/', '.');
            if (dotted.startsWith(dottedRoot)) {
                return prefix.replace('/', '.') + dotted;
            }
        }
        return dotted;
    }

    /**
     * Rewrites package names inside string constants: resource bundle names, {@code Class.forName}
     * arguments and resource paths all name the relocated packages as text.
     */
    private String mapText(String value) {
        String result = value;
        for (String root : RELOCATED_ROOTS) {
            String dottedRoot = root.replace('/', '.');
            String dottedPrefix = prefix.replace('/', '.');
            if (result.startsWith(dottedRoot)) {
                result = dottedPrefix + result;
            } else if (result.startsWith(root)) {
                result = prefix + result;
            } else if (result.startsWith("/" + root)) {
                result = "/" + prefix + result.substring(1);
            }
        }
        return result;
    }

    private void write(Path out, String mainClass) throws IOException {
        Files.createDirectories(out.toAbsolutePath().getParent());
        Manifest manifest = new Manifest();
        Attributes attributes = manifest.getMainAttributes();
        attributes.put(Attributes.Name.MANIFEST_VERSION, "1.0");
        attributes.putValue("Created-By", "google-java-format CheerpJ experiment");
        if (mainClass != null) {
            attributes.put(Attributes.Name.MAIN_CLASS, mainClass);
        }
        try (JarOutputStream jar = new JarOutputStream(Files.newOutputStream(out), manifest)) {
            jar.setLevel(Deflater.BEST_COMPRESSION);
            for (Map.Entry<String, byte[]> entry : entries.entrySet()) {
                JarEntry jarEntry = new JarEntry(entry.getKey());
                jarEntry.setTime(0L);
                jar.putNextEntry(jarEntry);
                jar.write(entry.getValue());
                jar.closeEntry();
            }
        }
    }

    private void report(Path out) throws IOException {
        System.out.println("bundle:            " + out);
        System.out.println("entries:           " + entries.size());
        System.out.println("size:              " + (Files.size(out) / 1024) + " KiB");
        System.out.println("relocated refs:    " + relocatedClasses);
        System.out.println("rewritten indy:    " + rewrittenSwitches + " (SwitchBootstraps -> SwitchShim)");
        System.out.println("substituted refs:  " + substitutedClasses + " " + SUBSTITUTED_CLASSES);
        System.out.println("substituted calls: " + substitutedMethods + " (Java 21 library methods -> ApiShims)");
        retargeted.forEach((change, count) -> System.out.println("retargeted:        " + count + " classes " + change));
    }
}
