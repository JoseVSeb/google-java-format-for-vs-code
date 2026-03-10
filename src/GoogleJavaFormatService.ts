import type { ExtensionContext, LogOutputChannel } from "vscode";
import { Uri } from "vscode";
import type {
  GoogleJavaFormatConfiguration,
  GoogleJavaFormatVersion,
} from "./ExtensionConfiguration";
import type { GoogleJavaFormatReleaseResponse } from "./GoogleJavaFormatRelease";
import { parseGoogleJavaFormatReleaseResponse } from "./GoogleJavaFormatRelease";
import { logAsyncMethod, logMethod } from "./logDecorator";

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
    const response = await fetch(url);
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
    const response = await fetch(url);
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
    { executable, mode, version }: GoogleJavaFormatConfiguration,
    context?: ExtensionContext,
  ): Promise<Uri> {
    if (executable) {
      this.log.debug(`Using config key 'executable': ${executable}`);
      return this.getUriFromString(executable);
    }

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
}
