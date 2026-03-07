import { createHash } from "node:crypto";

import path = require("node:path");

import type { ExtensionContext, LogOutputChannel } from "vscode";
import { commands, Uri, workspace } from "vscode";
import { logAsyncMethod } from "./logDecorator";

export class Cache {
  private uri: Uri;

  private constructor(
    private context: ExtensionContext,
    readonly log: LogOutputChannel,
    cacheFolder: string,
  ) {
    this.uri = Uri.joinPath(context.extensionUri, cacheFolder);
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

  subscribe() {
    this.context.subscriptions.push(
      commands.registerCommand("googleJavaFormatForVSCode.clearCache", this.clear.bind(this)),
    );
  }

  @logAsyncMethod
  async clear() {
    await workspace.fs.delete(this.uri, { recursive: true });
    this.log.info("Cache cleared.");
    await commands.executeCommand("googleJavaFormatForVSCode.reloadExecutable");
  }

  private async init() {
    try {
      await workspace.fs.createDirectory(this.uri);
      this.log.debug(`Cache directory created at ${this.uri.toString()}`);
    } catch (error) {
      this.log.error(`Failed to create cache directory: ${error}`);
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
    }
  }
}
