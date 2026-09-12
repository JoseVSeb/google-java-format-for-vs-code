package gjfweb.runtime;

import java.lang.Enum.EnumDesc;
import java.lang.invoke.CallSite;
import java.lang.invoke.ConstantCallSite;
import java.lang.invoke.MethodHandle;
import java.lang.invoke.MethodHandles;
import java.lang.invoke.MethodType;
import java.util.Objects;

/**
 * Java 17 stand-in for {@code java.lang.runtime.SwitchBootstraps}, which only became a final API in
 * Java 21.
 *
 * <p>The bundler rewrites every {@code invokedynamic} that targets {@code
 * SwitchBootstraps.typeSwitch} / {@code SwitchBootstraps.enumSwitch} to call these methods instead,
 * so pattern-matching switches keep working on a Java 17 JVM such as CheerpJ's.
 *
 * <p>Semantics follow the Java 21 specification of those bootstraps: the call site takes the
 * selector plus a restart index and returns the index of the first matching label at or after the
 * restart index, {@code -1} for a {@code null} selector, or {@code labels.length} when nothing
 * matches.
 */
public final class SwitchShim {

    private static final MethodHandle TYPE_SWITCH;
    private static final MethodHandle ENUM_SWITCH;

    static {
        try {
            MethodHandles.Lookup lookup = MethodHandles.lookup();
            TYPE_SWITCH = lookup.findStatic(
                    SwitchShim.class,
                    "doTypeSwitch",
                    MethodType.methodType(int.class, Object.class, int.class, Object[].class));
            ENUM_SWITCH = lookup.findStatic(
                    SwitchShim.class,
                    "doEnumSwitch",
                    MethodType.methodType(int.class, Object.class, int.class, Object[].class));
        } catch (ReflectiveOperationException e) {
            throw new ExceptionInInitializerError(e);
        }
    }

    private SwitchShim() {}

    /** Replacement bootstrap for {@code SwitchBootstraps.typeSwitch}. */
    public static CallSite typeSwitch(
            MethodHandles.Lookup lookup, String invocationName, MethodType invocationType, Object... labels) {
        return bind(TYPE_SWITCH, invocationType, labels);
    }

    /** Replacement bootstrap for {@code SwitchBootstraps.enumSwitch}. */
    public static CallSite enumSwitch(
            MethodHandles.Lookup lookup, String invocationName, MethodType invocationType, Object... labels) {
        return bind(ENUM_SWITCH, invocationType, labels);
    }

    private static CallSite bind(MethodHandle target, MethodType invocationType, Object[] labels) {
        Object[] copy = labels == null ? new Object[0] : labels.clone();
        MethodHandle bound = MethodHandles.insertArguments(target, 2, (Object) copy);
        return new ConstantCallSite(bound.asType(invocationType));
    }

    private static int doTypeSwitch(Object target, int restartIndex, Object[] labels) {
        if (target == null) {
            return -1;
        }
        for (int i = Math.max(restartIndex, 0); i < labels.length; i++) {
            if (matches(labels[i], target)) {
                return i;
            }
        }
        return labels.length;
    }

    private static int doEnumSwitch(Object target, int restartIndex, Object[] labels) {
        if (target == null) {
            return -1;
        }
        String name = ((Enum<?>) target).name();
        for (int i = Math.max(restartIndex, 0); i < labels.length; i++) {
            Object label = labels[i];
            if (label instanceof String) {
                if (name.equals(label)) {
                    return i;
                }
            } else if (matches(label, target)) {
                return i;
            }
        }
        return labels.length;
    }

    private static boolean matches(Object label, Object target) {
        if (label instanceof Class<?>) {
            return ((Class<?>) label).isInstance(target);
        }
        if (label instanceof EnumDesc<?>) {
            return target instanceof Enum
                    && ((EnumDesc<?>) label).constantName().equals(((Enum<?>) target).name())
                    && describesType((EnumDesc<?>) label, target.getClass());
        }
        if (label instanceof Integer) {
            return matchesInt(((Integer) label).intValue(), target);
        }
        return Objects.equals(label, target);
    }

    private static boolean matchesInt(int value, Object target) {
        if (target instanceof Number) {
            Number number = (Number) target;
            return (number instanceof Integer
                            || number instanceof Short
                            || number instanceof Byte
                            || number instanceof Long)
                    && number.longValue() == value;
        }
        if (target instanceof Character) {
            return ((Character) target).charValue() == value;
        }
        return false;
    }

    private static boolean describesType(EnumDesc<?> label, Class<?> actual) {
        String descriptor = label.constantType().descriptorString();
        for (Class<?> c = actual; c != null; c = c.getSuperclass()) {
            if (descriptor.equals("L" + c.getName().replace('.', '/') + ";")) {
                return true;
            }
        }
        return false;
    }
}
