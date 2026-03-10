const MAVEN_BASE = "https://repo1.maven.org/maven2/com/palantir/javaformat";

type System = `${NodeJS.Platform}-${NodeJS.Architecture}`;

/**
 * Maps VS Code platform/arch strings to the Maven classifier suffix used in
 * the palantir-java-format-native artifact filenames on Maven Central.
 *
 * Palantir currently publishes native images for Linux (glibc x86-64 and
 * aarch64) and macOS (aarch64). There is no Windows native binary and no
 * macOS x86-64 binary.
 */
const NATIVE_CLASSIFIER: Partial<Record<System, string>> = {
  "linux-x64": "nativeImage-linux-glibc_x86-64.bin",
  "linux-arm64": "nativeImage-linux-glibc_aarch64.bin",
  "darwin-arm64": "nativeImage-macos_aarch64.bin",
};

/**
 * Parses the `<release>` version string from a Maven Central `maven-metadata.xml`
 * response body.
 */
export function parsePalantirMavenMetadata(xml: string): string {
  const match = xml.match(/<release>([\d.]+)<\/release>/);
  if (!match) {
    throw new Error("Could not parse Palantir Java Format Maven metadata.");
  }
  return match[1];
}

/**
 * Builds an asset map from VS Code platform/arch keys to Maven Central
 * download URLs for the given palantir-java-format version.
 */
export function buildPalantirRelease(version: string) {
  const base = `${MAVEN_BASE}/palantir-java-format-native/${version}/palantir-java-format-native-${version}`;
  const assets = new Map<System, string>();
  for (const [system, classifier] of Object.entries(NATIVE_CLASSIFIER) as [System, string][]) {
    assets.set(system, `${base}-${classifier}`);
  }
  return { version, assets };
}

export type PalantirJavaFormatRelease = ReturnType<typeof buildPalantirRelease>;
