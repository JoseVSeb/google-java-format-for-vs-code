import com.example.Foo;
import java.util.List;

/** A well-formatted sample Java class used as a test fixture. */
public class FormattedSample {
  private final String name;
  private final int value;

  public FormattedSample(String name, int value) {
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
