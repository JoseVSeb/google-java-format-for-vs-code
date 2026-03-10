import { createHash } from "node:crypto";
import path from "node:path";
import type { ExtensionContext, LogOutputChannel } from "vscode";
import { commands, Uri, window, workspace } from "vscode";
import { logAsyncMethod, logMethod } from "./logDecorator";

export class Cache {
  private uri: Uri;
  // Tracks in-flight downloads keyed by URL. Concurrent calls for the same URL
  // join the existing Promise instead of starting a parallel download and racing
  // to write the same cached file. Each entry is removed on completion or error.
  private readonly downloadInFlight = new Map<string, Promise<Uri>>();

  private constructor(
    private context: ExtensionContext,
    readonly log: LogOutputChannel,
    cacheFolder: string,
  ) {
    this.uri = Uri.joinPath(context.extensionUri, cacheFolder);
    this.clear = this.clear.bind(this);
  }

  public static async getInstance(
    context: ExtensionContext,
    log: LogOutputChannel,
    cacheFolder = "cache",
  ) {
    const cache = new Cache(context, log, cacheFolder);
    await cache.init();
    return cache;
  }

  @logMethod
  subscribe() {
    this.context.subscriptions.push(
      commands.registerCommand("googleJavaFormatForVSCode.clearCache", this.clear),
    );
  }

  @logAsyncMethod
  async clear() {
    await workspace.fs.delete(this.uri, { recursive: true });
    this.log.info("Cache cleared.");
    await commands.executeCommand("googleJavaFormatForVSCode.reloadExecutable");
  }

  @logAsyncMethod
  private async init() {
    try {
      await workspace.fs.createDirectory(this.uri);
      this.log.debug(`Cache directory created at ${this.uri.toString()}`);
    } catch (error) {
      this.log.error(`Failed to create cache directory: ${error}`);
      void window.showErrorMessage(
        `Google Java Format: Failed to initialize cache. Format operations will be unavailable. ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  @logAsyncMethod
  async get(url: string) {
    const basename = path.basename(url);
    const hash = createHash("md5").update(url).digest("hex");
    const dirname = Uri.joinPath(this.uri, hash);
    const localPath = Uri.joinPath(dirname, basename);

    try {
      await workspace.fs.stat(localPath);
      this.log.info(`Using cached file at ${localPath.toString()}`);
      return localPath;
    } catch (_statError) {
      // File not in cache. Join an existing in-flight download for this URL
      // (if any) so two concurrent loads for the same artifact don't race to
      // write the same cached file. Unlike a time-based global throttle, this
      // Map is keyed per-URL, so a different URL (e.g. a 404 test URL) is
      // always fetched independently.
      const existing = this.downloadInFlight.get(url);
      if (existing) {
        this.log.debug(`Joining in-flight download for ${url}`);
        return existing;
      }

      const doDownload = async (): Promise<Uri> => {
        try {
          await workspace.fs.createDirectory(dirname);
          this.log.debug(`Cache directory created at ${dirname.toString()}`);
        } catch (mkdirError) {
          this.log.error(`Failed to create cache directory: ${mkdirError}`);
          throw mkdirError;
        }

        this.log.info(`Downloading file from ${url}`);
        const response = await fetch(url);
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          await workspace.fs.writeFile(localPath, new Uint8Array(buffer));
          this.log.info(`File saved to ${localPath.toString()}`);
          return localPath;
        }
        throw new Error(
          `Failed to download file from ${url}: ${response.status} ${response.statusText}`,
        );
      };
      const download = doDownload().finally(() => this.downloadInFlight.delete(url));
      this.downloadInFlight.set(url, download);
      return download;
    }
  }
}
