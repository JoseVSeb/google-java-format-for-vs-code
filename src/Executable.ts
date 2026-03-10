import { execFileSync, execSync } from "node:child_process";
import path from "node:path";
import type { ExtensionContext, LogOutputChannel } from "vscode";
import { commands, ProgressLocation, window } from "vscode";
import type { Cache } from "./Cache";
import type { ExtensionConfiguration } from "./ExtensionConfiguration";
import type { GoogleJavaFormatService } from "./GoogleJavaFormatService";
import { logAsyncMethod, logMethod } from "./logDecorator";

type RunnerConfig = {
  cwd: string;
  runnerFile: string;
  runnerArgs: string[];
};

export class Executable {
  // loadPromise carries the resolved RunnerConfig so that run() reads a
  // self-consistent snapshot from whichever load() call it awaits.  This means
  // load() uses only local variables (no shared-field writes across awaits), and
  // concurrent / overlapping calls cannot corrupt each other's state.
  // The `!` is safe because getInstance() always calls startLoad() before
  // returning, guaranteeing loadPromise is assigned before run() can be invoked.
  private loadPromise!: Promise<RunnerConfig>;

  private constructor(
    private context: ExtensionContext,
    private config: ExtensionConfiguration,
    private cache: Cache,
    private service: GoogleJavaFormatService,
    readonly log: LogOutputChannel,
  ) {
    this.run = this.run.bind(this);
    this.load = this.load.bind(this);
    this.startLoad = this.startLoad.bind(this);
    this.configurationChangeListener = this.configurationChangeListener.bind(this);
  }

  public static getInstance(
    context: ExtensionContext,
    config: ExtensionConfiguration,
    cache: Cache,
    service: GoogleJavaFormatService,
    log: LogOutputChannel,
  ) {
    const instance = new Executable(context, config, cache, service, log);
    instance.startLoad();
    return instance;
  }

  // TODO: signal is accepted for future cancellation support; execSync is synchronous
  // and cannot honour an AbortSignal mid-execution — switch to async spawn when needed.
  @logAsyncMethod
  async run({ args, stdin }: { args: string[]; stdin: string; signal?: AbortSignal }) {
    const { cwd, runnerFile, runnerArgs } = await this.loadPromise;
    return new Promise<string>((resolve, reject) => {
      const command = [runnerFile, ...runnerArgs, ...args, "-"].join(" ");
      this.log.debug(`> ${command}`);
      try {
        const stdout = execSync(command, {
          cwd,
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

  @logMethod
  subscribe() {
    this.config.subscriptions.push(this.configurationChangeListener);
    this.context.subscriptions.push(
      commands.registerCommand("googleJavaFormatForVSCode.reloadExecutable", () => {
        this.startLoad();
        // loadPromise may reject (e.g. bad version or unreachable URL).
        // Catch the rejection here to show an error notification instead of
        // propagating it to the VS Code command infrastructure as an unhandled
        // rejection. The error is already logged by @logAsyncMethod on load().
        return this.loadPromise.catch((err: unknown) => {
          const message = `Google Java Format: Failed to reload executable. ${err instanceof Error ? err.message : String(err)}`;
          void window.showErrorMessage(message);
        });
      }),
    );
  }

  @logMethod
  private startLoad(): void {
    this.loadPromise = this.load();
    // Attach a no-op handler so that a rejection before the first format attempt
    // does not produce an "unhandledRejection" warning.  Errors are already
    // logged by the @logAsyncMethod decorator on load(), and any awaiter of
    // run() will still observe the rejection through this.loadPromise.
    this.loadPromise.catch(() => {});
  }

  @logAsyncMethod
  private async load(): Promise<RunnerConfig> {
    const uri = await this.service.resolveExecutableFile(this.config, this.context);

    const { fsPath } = uri.scheme === "file" ? uri : await this.cache.get(uri.toString());

    const isJar = fsPath.endsWith(".jar");
    const cwd = path.dirname(fsPath);
    const basename = path.basename(fsPath);

    this.log.debug(`Setting current working directory: ${cwd}`);

    await this.enableExecutionPermission(cwd, basename);

    let runnerFile: string;
    let runnerArgs: string[];
    if (isJar) {
      runnerFile = "java";
      runnerArgs = ["-jar", `./${basename}`];
    } else if (process.platform === "win32") {
      runnerFile = basename;
      runnerArgs = [];
    } else {
      runnerFile = `./${basename}`;
      runnerArgs = [];
    }

    return { cwd, runnerFile, runnerArgs };
  }

  @logAsyncMethod
  private async enableExecutionPermission(cwd: string, basename: string) {
    if (basename.endsWith(".jar")) {
      return;
    }

    if ((["linux", "darwin"] as NodeJS.Platform[]).includes(process.platform)) {
      this.log.debug(`Setting executable permission on ${basename}`);
      execFileSync("chmod", ["+x", basename], { cwd });
    }
  }

  @logAsyncMethod
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
    window
      .withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Updating executable...",
          cancellable: false,
        },
        () => {
          this.startLoad();
          return this.loadPromise;
        },
      )
      .then(undefined, (err: unknown) => {
        const message = `Google Java Format: Failed to update executable. ${err instanceof Error ? err.message : String(err)}`;
        this.log.error(message);
        void window.showErrorMessage(message);
      });
  }
}
