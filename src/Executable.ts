import { execSync } from "node:child_process";

import path = require("node:path");

import type { ExtensionContext, LogOutputChannel } from "vscode";
import { commands, ProgressLocation, window } from "vscode";
import type { Cache } from "./Cache";
import type { ExtensionConfiguration } from "./ExtensionConfiguration";
import type { GoogleJavaFormatService } from "./GoogleJavaFormatService";
import { logAsyncMethod } from "./logDecorator";

export class Executable {
  private runnerFile: string = null!;
  private runnerArgs: string[] = null!;
  private cwd: string = null!;

  private constructor(
    private context: ExtensionContext,
    private config: ExtensionConfiguration,
    private cache: Cache,
    private service: GoogleJavaFormatService,
    readonly log: LogOutputChannel,
  ) {
    this.run = this.run.bind(this);
    this.load = this.load.bind(this);
    this.configurationChangeListener = this.configurationChangeListener.bind(this);
  }

  public static async getInstance(
    context: ExtensionContext,
    config: ExtensionConfiguration,
    cache: Cache,
    service: GoogleJavaFormatService,
    log: LogOutputChannel,
  ) {
    const instance = new Executable(context, config, cache, service, log);
    await instance.load();
    return instance;
  }

  // TODO: signal is accepted for future cancellation support; execSync is synchronous
  // and cannot honour an AbortSignal mid-execution — switch to async spawn when needed.
  async run({ args, stdin }: { args: string[]; stdin: string; signal?: AbortSignal }) {
    return new Promise<string>((resolve, reject) => {
      const command = [this.runnerFile, ...this.runnerArgs, ...args, "-"].join(" ");
      this.log.debug(`> ${command}`);
      try {
        const stdout = execSync(command, {
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
    this.config.subscriptions.push(this.configurationChangeListener);
    this.context.subscriptions.push(
      commands.registerCommand("googleJavaFormatForVSCode.reloadExecutable", this.load),
    );
  }

  @logAsyncMethod
  private async load() {
    const uri = await this.service.resolveExecutableFile(this.config, this.context);

    const { fsPath } = uri.scheme === "file" ? uri : await this.cache.get(uri.toString());

    const isJar = fsPath.endsWith(".jar");
    this.cwd = path.dirname(fsPath);
    const basename = path.basename(fsPath);

    this.log.debug(`Setting current working directory: ${this.cwd}`);

    await this.enableExecutionPermission(basename);

    if (isJar) {
      this.runnerFile = "java";
      this.runnerArgs = ["-jar", `./${basename}`];
    } else if (process.platform === "win32") {
      this.runnerFile = basename;
      this.runnerArgs = [];
    } else {
      this.runnerFile = `./${basename}`;
      this.runnerArgs = [];
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
      this.load,
    );
  }
}
