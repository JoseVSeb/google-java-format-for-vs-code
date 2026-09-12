package gjfweb.runtime;

import java.util.List;

/**
 * Java 17 implementations of the handful of Java 21 library methods the bundled code calls.
 *
 * <p>The bundler rewrites those call sites into static calls on this class, moving the receiver into
 * the first argument. The set is small and is kept honest by the API scanner, which fails the build
 * when a bundled class references a platform method the target release does not have.
 */
public final class ApiShims {

    private ApiShims() {}

    /** {@code StringBuilder.repeat(int, int)}, added in Java 21. */
    public static StringBuilder stringBuilderRepeat(StringBuilder builder, int codePoint, int count) {
        if (count < 0) {
            throw new IllegalArgumentException("count is negative: " + count);
        }
        String unit = new String(Character.toChars(codePoint));
        for (int i = 0; i < count; i++) {
            builder.append(unit);
        }
        return builder;
    }

    /** {@code SequencedCollection.getFirst()}, added in Java 21. */
    public static Object listGetFirst(List<?> list) {
        if (list.isEmpty()) {
            throw new java.util.NoSuchElementException();
        }
        return list.get(0);
    }

    /** {@code SequencedCollection.getLast()}, added in Java 21. */
    public static Object listGetLast(List<?> list) {
        if (list.isEmpty()) {
            throw new java.util.NoSuchElementException();
        }
        return list.get(list.size() - 1);
    }

    /** {@code SequencedCollection.addFirst(E)}, added in Java 21. */
    @SuppressWarnings("unchecked")
    public static void listAddFirst(List<?> list, Object element) {
        ((List<Object>) list).add(0, element);
    }

    /** {@code SequencedCollection.addLast(E)}, added in Java 21. */
    @SuppressWarnings("unchecked")
    public static void listAddLast(List<?> list, Object element) {
        ((List<Object>) list).add(element);
    }
}
