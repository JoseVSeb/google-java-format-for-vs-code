package gjfweb.runtime;

/**
 * Java 17 stand-in for {@code java.lang.MatchException}, added in Java 21.
 *
 * <p>The compiler throws it when an exhaustive pattern switch matches nothing at run time, so it
 * appears in the bytecode of every class that uses such a switch. The bundler rewrites references to
 * the Java 21 class into references to this one: {@code java.lang} is a restricted package, so the
 * original name cannot simply be defined.
 */
public class MatchException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public MatchException() {
        super();
    }

    public MatchException(String message, Throwable cause) {
        super(message, cause);
    }

    public MatchException(String message) {
        super(message);
    }

    public MatchException(Throwable cause) {
        super(cause);
    }
}
