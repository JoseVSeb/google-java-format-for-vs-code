package gjfcheerpj.verify;

import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.TreeSet;
import java.util.jar.JarFile;
import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassVisitor;
import org.objectweb.asm.Handle;
import org.objectweb.asm.MethodVisitor;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;

/**
 * Reports every platform class, method and field the bundle references that the JVM running this
 * scanner does not provide.
 *
 * <p>Run it on the oldest JVM the bundle is meant to support: anything it prints would fail at run
 * time with {@code NoSuchMethodError} or {@code NoClassDefFoundError} the first time the owning code
 * path executes, which is exactly the class of breakage that is easy to miss in a spot check.
 */
public final class ApiScanner {

    /** Methods whose descriptor is synthesised per call site; reflection cannot match them. */
    private static final Set<String> SIGNATURE_POLYMORPHIC =
            Set.of("java/lang/invoke/MethodHandle", "java/lang/invoke/VarHandle");

    private final Set<String> missing = new TreeSet<>();
    private final Set<String> seen = new LinkedHashSet<>();
    private final String relocatedPrefix;

    private ApiScanner(String relocatedPrefix) {
        this.relocatedPrefix = relocatedPrefix;
    }

    public static void main(String[] args) throws IOException {
        Path bundle = Paths.get(args[0]);
        String prefix = args.length > 1 ? args[1] : "gjfweb/shaded/";
        ApiScanner scanner = new ApiScanner(prefix);
        scanner.scan(bundle);
        scanner.report();
        if (!scanner.missing.isEmpty()) {
            System.exit(1);
        }
    }

    private void scan(Path bundle) throws IOException {
        try (JarFile jar = new JarFile(bundle.toFile())) {
            for (var entry : (Iterable<java.util.jar.JarEntry>) jar.stream()::iterator) {
                if (!entry.getName().endsWith(".class")) {
                    continue;
                }
                try (InputStream in = jar.getInputStream(entry)) {
                    new ClassReader(in.readAllBytes()).accept(new RefCollector(), ClassReader.SKIP_FRAMES);
                }
            }
        }
    }

    private final class RefCollector extends ClassVisitor {
        private RefCollector() {
            super(Opcodes.ASM9);
        }

        @Override
        public MethodVisitor visitMethod(
                int access, String name, String descriptor, String signature, String[] exceptions) {
            return new MethodVisitor(Opcodes.ASM9) {
                @Override
                public void visitMethodInsn(
                        int opcode, String owner, String name, String descriptor, boolean isInterface) {
                    checkMethod(owner, name, descriptor);
                }

                @Override
                public void visitFieldInsn(int opcode, String owner, String name, String descriptor) {
                    checkField(owner, name);
                }

                @Override
                public void visitTypeInsn(int opcode, String type) {
                    checkClass(type);
                }

                @Override
                public void visitInvokeDynamicInsn(
                        String name, String descriptor, Handle bootstrap, Object... bootstrapArgs) {
                    checkMethod(bootstrap.getOwner(), bootstrap.getName(), bootstrap.getDesc());
                }
            };
        }
    }

    /**
     * Every reference is checked, not only the platform ones: a call such as {@code
     * ImmutableList.getFirst()} names a bundled class but resolves through {@code
     * java.util.SequencedCollection}, so it breaks on an older runtime just the same.
     */
    private boolean isChecked(String internalName) {
        return !internalName.startsWith("[") && !SIGNATURE_POLYMORPHIC.contains(internalName);
    }

    private void checkClass(String internalName) {
        if (!isChecked(internalName) || !seen.add("C " + internalName)) {
            return;
        }
        if (load(internalName) == null) {
            missing.add("class " + internalName.replace('/', '.'));
        }
    }

    private void checkMethod(String owner, String name, String descriptor) {
        if (!isChecked(owner) || !seen.add("M " + owner + "#" + name + descriptor)) {
            return;
        }
        Class<?> type = load(owner);
        if (type == null) {
            missing.add("class " + owner.replace('/', '.'));
            return;
        }
        if (name.equals("<init>")) {
            for (Constructor<?> candidate : constructorsOf(type)) {
                if (Type.getConstructorDescriptor(candidate).equals(descriptor)) {
                    return;
                }
            }
            missing.add("constructor " + owner.replace('/', '.') + descriptor);
            return;
        }
        if (name.equals("<clinit>") || findMethod(type, name, descriptor)) {
            return;
        }
        missing.add("method " + owner.replace('/', '.') + "." + name + descriptor);
    }

    private boolean findMethod(Class<?> type, String name, String descriptor) {
        if (type.isInterface() && findMethod(Object.class, name, descriptor)) {
            return true; // interface calls may resolve to java.lang.Object
        }
        for (Class<?> current = type; current != null; current = current.getSuperclass()) {
            for (Method candidate : methodsOf(current)) {
                if (candidate.getName().equals(name) && Type.getMethodDescriptor(candidate).equals(descriptor)) {
                    return true;
                }
            }
            for (Class<?> iface : interfacesOf(current)) {
                if (findMethod(iface, name, descriptor)) {
                    return true;
                }
            }
        }
        return false;
    }

    private void checkField(String owner, String name) {
        if (!isChecked(owner) || !seen.add("F " + owner + "#" + name)) {
            return;
        }
        Class<?> type = load(owner);
        if (type == null) {
            missing.add("class " + owner.replace('/', '.'));
            return;
        }
        for (Class<?> current = type; current != null; current = current.getSuperclass()) {
            for (Field field : fieldsOf(current)) {
                if (field.getName().equals(name)) {
                    return;
                }
            }
        }
        missing.add("field " + owner.replace('/', '.') + "." + name);
    }

    // Reflection on a class whose members mention an absent type throws; that counts as missing.
    private static Class<?>[] interfacesOf(Class<?> type) {
        try {
            return type.getInterfaces();
        } catch (LinkageError e) {
            return new Class<?>[0];
        }
    }

    private static Constructor<?>[] constructorsOf(Class<?> type) {
        try {
            return type.getDeclaredConstructors();
        } catch (LinkageError e) {
            return new Constructor<?>[0];
        }
    }

    private static Method[] methodsOf(Class<?> type) {
        try {
            return type.getDeclaredMethods();
        } catch (LinkageError e) {
            return new Method[0];
        }
    }

    private static Field[] fieldsOf(Class<?> type) {
        try {
            return type.getDeclaredFields();
        } catch (LinkageError e) {
            return new Field[0];
        }
    }

    private Class<?> load(String internalName) {
        try {
            return Class.forName(internalName.replace('/', '.'), false, ApiScanner.class.getClassLoader());
        } catch (ClassNotFoundException | LinkageError e) {
            return null;
        }
    }

    private void report() {
        System.out.println("checked " + seen.size() + " platform references on Java "
                + System.getProperty("java.specification.version"));
        if (missing.isEmpty()) {
            System.out.println("no missing platform API");
            return;
        }
        System.out.println(missing.size() + " reference(s) absent from this runtime:");
        missing.forEach(entry -> System.out.println("  " + entry));
    }
}
