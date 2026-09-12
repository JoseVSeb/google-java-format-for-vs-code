package testdata;

import java.util.List;

/**
 * Java 21 syntax that a Java 17 compiler cannot parse.
 *
 * <p>The bundle carries JDK 21's javac, so formatting this file proves the formatter is parsing with
 * the bundled compiler rather than falling back to the host JVM's older one.
 */
public sealed interface ModernSyntax permits ModernSyntax.Circle, ModernSyntax.Rect {

  record Point(int x, int y) {}

  record Circle(Point center, double radius) implements ModernSyntax {}

  record Rect(Point lower, Point upper) implements ModernSyntax {}

  static String describe(Object shape) {
    return switch (shape) {
      case Circle(Point(var x, var y), double r) when r > 10 -> "big circle at " + x + "," + y;
      case Circle c -> "circle of radius " + c.radius();
      case Rect(Point lower, Point upper) -> "rect " + lower + " to " + upper;
      case Integer i when i < 0 -> "negative";
      case null -> "nothing";
      default -> "unknown";
    };
  }

  static String banner() {
    return """
        multi-line
          text block
        """;
  }

  static List<String> all(List<Object> shapes) {
    return shapes.stream().map(ModernSyntax::describe).toList();
  }
}
