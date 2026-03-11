import java.util.List;
import com.example.Foo;

/**A poorly-formatted sample Java class used as a test fixture. */
public class UnformattedSample{
  private   String   name;
  private int    value;

  public UnformattedSample(String name,int value){
    this.name=name;
    this.value  =  value;
  }

  public String getName(){return name;}

  public int getValue(){return value;}

  public   List<String>   getItems(){
    return List.of( "a","b","c" );
  }

  // Deliberately kept on one line to exercise formatter-specific lambda layout.
  private static void configureResolvedVersionsWithVersionMapping(Project project) {
    project.getPluginManager().withPlugin("maven-publish", plugin -> { project.getExtensions().getByType(PublishingExtension.class).getPublications().withType(MavenPublication.class).configureEach(publication -> publication.versionMapping(mapping -> { mapping.allVariants(VariantVersionMappingStrategy::fromResolutionResult); })); });
  }
}
