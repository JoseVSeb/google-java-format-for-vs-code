import type { ExtensionContext, LogOutputChannel } from "vscode";
import { Uri } from "vscode";
import type {
  GoogleJavaFormatConfiguration,
  GoogleJavaFormatVersion,
} from "./ExtensionConfiguration";
import { fetchWithCerts } from "./fetchWithCerts";
import type { GoogleJavaFormatReleaseResponse } from "./GoogleJavaFormatRelease";
import { parseGoogleJavaFormatReleaseResponse } from "./GoogleJavaFormatRelease";
import { logAsyncMethod, logMethod } from "./logDecorator";
import { buildPalantirRelease, parsePalantirMavenMetadata } from "./PalantirJavaFormatRelease";

/**
 * Service class that encapsulates GitHub release lookups and URI resolution.
 * Initialized with a `LogOutputChannel` so that method-level decorators
 * (`@logMethod`, `@logAsyncMethod`) can use `this.log` for structured logging.
 * The method names are preserved as property-key strings even in production
 * (minified/bundled) builds, unlike `Function.prototype.name`.
 */
export class GoogleJavaFormatService {
  constructor(readonly log: LogOutputChannel) {}

  /**
   * Fetches the latest release of google-java-format from the GitHub API.
   */
  @logAsyncMethod
  async getLatestRelease() {
    const url = "https://api.github.com/repos/google/google-java-format/releases/latest";
    this.log.debug("Fetching:", url);
    const response = await fetchWithCerts(url);
    if (!response.ok) {
      throw new Error("Failed to get latest release of Google Java Format.");
    }
    return parseGoogleJavaFormatReleaseResponse(
      (await response.json()) as GoogleJavaFormatReleaseResponse,
    );
  }

  /**
   * Fetches a specific tagged release of google-java-format from the GitHub API.
   */
  @logAsyncMethod
  async getReleaseByVersion(version: Exclude<GoogleJavaFormatVersion, "latest">) {
    const url = `https://api.github.com/repos/google/google-java-format/releases/tags/v${version}`;
    this.log.debug("Fetching:", url);
    const response = await fetchWithCerts(url);
    if (!response.ok) {
      throw new Error(`Failed to get v${version} of Google Java Format.`);
    }
    return parseGoogleJavaFormatReleaseResponse(
      (await response.json()) as GoogleJavaFormatReleaseResponse,
    );
  }

  /**
   * Parses a string value into a VS Code `Uri`.
   * Remote URLs (http/https/file scheme) are parsed; plain paths are treated as
   * local file paths.
   */
  @logMethod
  getUriFromString(value: string): Uri {
    const isRemote =
      value.startsWith("http:/") || value.startsWith("https:/") || value.startsWith("file:/");
    return isRemote ? Uri.parse(value, true) : Uri.file(value);
  }

  @logAsyncMethod
  async resolveExecutableFile(
    { executable, mode, style, version }: GoogleJavaFormatConfiguration,
    context?: ExtensionContext,
  ): Promise<Uri> {
    if (executable) {
      this.log.debug(`Using config key 'executable': ${executable}`);
      return this.getUriFromString(executable);
    }

    const isPalantir = style === "palantir";

    if (isPalantir) {
      return this.resolvePalantirExecutableFile({ mode, version }, context);
    }

    return this.resolveGoogleExecutableFile({ mode, version }, context);
  }

  @logAsyncMethod
  private async resolveGoogleExecutableFile(
    { mode, version }: Pick<GoogleJavaFormatConfiguration, "mode" | "version">,
    context?: ExtensionContext,
  ): Promise<Uri> {
    const shouldCheckNativeBinary = mode === "native-binary";
    const system = `${process.platform}-${process.arch}` as const;
    if (shouldCheckNativeBinary) {
      this.log.debug(`Using native binary for ${system} if available`);
    }

    if (version === "latest") {
      this.log.debug(`Using latest version...`);
    }

    const stateKey = `resolvedUrl:${version ?? "latest"}:${mode ?? "jar-file"}:${system}`;

    try {
      const { assets } =
        version && version !== "latest"
          ? await this.getReleaseByVersion(version)
          : await this.getLatestRelease();

      const url = (shouldCheckNativeBinary && assets.get(system)) || assets.get("java")!;
      this.log.debug(`Using url: ${url}`);

      if (context) {
        await context.globalState.update(stateKey, url);
      }

      return Uri.parse(url);
    } catch (error) {
      const cachedUrl = context?.globalState.get<string>(stateKey);
      if (cachedUrl) {
        this.log.warn(`Network unavailable, falling back to last known url: ${cachedUrl}`);
        return Uri.parse(cachedUrl);
      }
      throw error;
    }
  }

  @logAsyncMethod
  private async resolvePalantirExecutableFile(
    { mode, version }: Pick<GoogleJavaFormatConfiguration, "mode" | "version">,
    context?: ExtensionContext,
  ): Promise<Uri> {
    if (mode === "jar-file") {
      throw new Error(
        "Palantir Java Format does not provide a standalone jar file. " +
          "Please use mode 'native-binary', or set 'executable' to point to a local palantir-java-format binary.",
      );
    }

    const system = `${process.platform}-${process.arch}` as const;
    this.log.debug(`Resolving Palantir Java Format native binary for ${system}`);

    const stateKey = `resolvedUrl:palantir:${version ?? "latest"}:${system}`;

    try {
      const { assets } =
        version && version !== "latest"
          ? await this.getPalantirReleaseByVersion(version)
          : await this.getPalantirLatestRelease();

      const url = assets.get(system);
      if (!url) {
        throw new Error(
          `Palantir Java Format does not provide a native binary for ${system}. ` +
            "Please set 'executable' to point to a local palantir-java-format binary.",
        );
      }
      this.log.debug(`Using url: ${url}`);

      if (context) {
        await context.globalState.update(stateKey, url);
      }

      return Uri.parse(url);
    } catch (error) {
      const cachedUrl = context?.globalState.get<string>(stateKey);
      if (cachedUrl) {
        this.log.warn(`Network unavailable, falling back to last known url: ${cachedUrl}`);
        return Uri.parse(cachedUrl);
      }
      throw error;
    }
  }

  /**
   * Fetches the latest release of palantir-java-format from Maven Central.
   */
  @logAsyncMethod
  async getPalantirLatestRelease() {
    const url =
      "https://repo1.maven.org/maven2/com/palantir/javaformat/palantir-java-format-native/maven-metadata.xml";
    this.log.debug("Fetching:", url);
    const response = await fetchWithCerts(url);
    if (!response.ok) {
      throw new Error("Failed to get latest release of Palantir Java Format.");
    }
    const xml = await response.text();
    const version = parsePalantirMavenMetadata(xml);
    return buildPalantirRelease(version);
  }

  /**
   * Returns a specific versioned release of palantir-java-format from Maven Central.
   * The version string must match an existing Maven Central artifact version (e.g. "2.89.0").
   * Note: the version is not validated against Maven Central — an invalid version will only
   * fail when the download of the constructed URL is attempted.
   */
  @logAsyncMethod
  async getPalantirReleaseByVersion(version: Exclude<GoogleJavaFormatVersion, "latest">) {
    return buildPalantirRelease(version);
  }
}
