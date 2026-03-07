import { execSync } from "node:child_process";

import path = require("node:path");

import type { ExtensionContext, LogOutputChannel } from "vscode";
import { commands, ProgressLocation, window } from "vscode";
import type { Cache } from "./Cache";
import type { ExtensionConfiguration } from "./ExtensionConfiguration";
import { logAsyncMethod } from "./logDecorator";
import { resolveExecutableFileFromConfig } from "./resolveExecutableFileFromConfig";

export class Executable {
  private runner: string = null!;
  private cwd: string = null!;

  private constructor(
    private context: ExtensionContext,
    private config: ExtensionConfiguration,
    private cache: Cache,
    readonly log: LogOutputChannel,
  ) {}

  public static async getInstance(
    context: ExtensionContext,
    config: ExtensionConfiguration,
    cache: Cache,
    log: LogOutputChannel,
  ) {
    const instance = new Executable(context, config, cache, log);
    await instance.load();
    return instance;
  }

  async run({ args, stdin }: { args: string[]; stdin: string; signal?: AbortSignal }) {
    return new Promise<string>((resolve, reject) => {
      try {
        const command = `${this.runner} ${args.join(" ")} -`;
        this.log.debug(`> ${command}`);
        const stdout: string = execSync(command, {
          cwd: this.cwd,
          encoding: "utf8",
          input: stdin,
          maxBuffer: Number.POSITIVE_INFINITY,
          windowsHide: true,
        });
        resolve(stdout);
      } catch (e) {
        reject(e);
      }
    });
  }

  subscribe() {
    this.config.subscriptions.push(this.configurationChangeListener.bind(this));
    this.context.subscriptions.push(
      commands.registerCommand("googleJavaFormatForVSCode.reloadExecutable", this.load.bind(this)),
    );
  }

  @logAsyncMethod
  private async load() {
    const uri = await resolveExecutableFileFromConfig(this.config, this.log, this.context);

    const { fsPath } = uri.scheme === "file" ? uri : await this.cache.get(uri.toString());

    const isJar = fsPath.endsWith(".jar");
    this.cwd = path.dirname(fsPath);
    const basename = path.basename(fsPath);

    this.log.debug(`Setting current working directory: ${this.cwd}`);

    await this.enableExecutionPermission(basename);

    if (isJar) {
      this.runner = `java -jar ./${basename}`;
    } else if (process.platform === "win32") {
      this.runner = basename;
    } else {
      this.runner = `./${basename}`;
    }
  }

  private async enableExecutionPermission(basename: string) {
    if (basename.endsWith(".jar")) {
      return;
    }

    if ((["linux", "darwin"] as NodeJS.Platform[]).includes(process.platform)) {
      const command = `chmod +x ${basename}`;
      this.log.debug(`> ${command}`);
      execSync(command, { cwd: this.cwd });
    }
  }

  private async configurationChangeListener() {
    this.log.info("Configuration change detected.");
    const action = await window.showInformationMessage(
      "Configuration change detected. Update executable?",
      "Update",
      "Ignore",
    );

    if (action !== "Update") {
      this.log.debug("User ignored updating executable.");
      return;
    }

    this.log.debug("Updating executable...");
    window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: "Updating executable...",
        cancellable: false,
      },
      this.load.bind(this),
    );
  }
}
