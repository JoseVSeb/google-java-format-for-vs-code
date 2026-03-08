import { execFileSync, execSync } from "node:child_process";

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

  async run({ args, stdin, signal }: { args: string[]; stdin: string; signal?: AbortSignal }) {
    return new Promise<string>((resolve, reject) => {
      const allArgs = [...this.runnerArgs, ...args, "-"];
      const debugCmd = `${this.runnerFile} ${allArgs.join(" ")}`;
      this.log.debug(`> ${debugCmd}`);
      try {
        // `signal` is supported by execFileSync at runtime in Node.js ≥17.7/16.15,
        // but older @types/node definitions do not include it in ExecFileSyncOptions.
        const execOptions: Parameters<typeof execFileSync>[2] & { signal?: AbortSignal } = {
          cwd: this.cwd,
          encoding: "utf8",
          input: stdin,
          maxBuffer: Number.POSITIVE_INFINITY,
          windowsHide: true,
          signal,
        };
        const stdout = execFileSync(
          this.runnerFile,
          allArgs,
          execOptions as Parameters<typeof execFileSync>[2],
        );
        resolve(stdout as string);
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
