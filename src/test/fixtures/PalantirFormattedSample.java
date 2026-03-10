import java.util.List;

/** A well-formatted sample Java class (Palantir style) used as a test fixture. */
public class PalantirFormattedSample {
  private final String name;
  private final int value;

  public PalantirFormattedSample(String name, int value) {
    this.name = name;
    this.value = value;
  }

  public String getName() {
    return name;
  }

  public int getValue() {
    return value;
  }

  public List<String> getItems() {
    return List.of("a", "b", "c");
  }
}
