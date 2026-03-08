import { execSync } from "node:child_process";
import path from "node:path";
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
  private loadPromise: Promise<void> = Promise.resolve();
  private loadGeneration = 0;

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
  async run({ args, stdin }: { args: string[]; stdin: string; signal?: AbortSignal }) {
    // Wait until loadPromise settles and loadPromise hasn't been replaced by a
    // newer startLoad() call in the meantime.  A superseded load() returns early
    // without committing state, so its promise resolves but loadPromise will have
    // already advanced; the loop catches that and re-waits on the newer promise.
    let p: Promise<void>;
    do {
      p = this.loadPromise;
      await p; // eslint-disable-line no-await-in-loop
    } while (p !== this.loadPromise);
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
      commands.registerCommand("googleJavaFormatForVSCode.reloadExecutable", () => {
        this.startLoad();
        return this.loadPromise;
      }),
    );
  }

  private startLoad(): void {
    const gen = ++this.loadGeneration;
    // Always start a new load immediately as a microtask — never chained behind
    // a prior in-flight load.  Rapid-fire calls within the same synchronous tick
    // are deduplicated: only the callback where gen === loadGeneration runs load().
    // Calls separated by at least one await can each start load() concurrently;
    // load() itself captures loadGeneration on entry and only commits its results
    // when still the latest generation, so concurrent loads cannot corrupt state.
    this.loadPromise = Promise.resolve().then(() => {
      if (gen === this.loadGeneration) return this.load();
      return undefined;
    });
    // Suppress "unhandledRejection" noise; errors are logged by @logAsyncMethod
    // and re-thrown when run() awaits loadPromise.
    this.loadPromise.catch(() => {});
  }

  @logAsyncMethod
  private async load() {
    // Capture the generation at entry.  Any startLoad() call made while this
    // load is suspended at an await will increment loadGeneration; the check
    // below then skips the commit so concurrent loads cannot corrupt state.
    const gen = this.loadGeneration;

    const uri = await this.service.resolveExecutableFile(this.config, this.context);

    const { fsPath } = uri.scheme === "file" ? uri : await this.cache.get(uri.toString());

    const isJar = fsPath.endsWith(".jar");
    const cwd = path.dirname(fsPath);
    const basename = path.basename(fsPath);

    this.log.debug(`Setting current working directory: ${cwd}`);

    await this.enableExecutionPermission(basename, cwd);

    // Only commit to shared state if this is still the latest generation.
    if (gen !== this.loadGeneration) return;

    this.cwd = cwd;
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

  private async enableExecutionPermission(basename: string, cwd: string) {
    if (basename.endsWith(".jar")) {
      return;
    }

    if ((["linux", "darwin"] as NodeJS.Platform[]).includes(process.platform)) {
      const command = `chmod +x ${basename}`;
      this.log.debug(`> ${command}`);
      execSync(command, { cwd });
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
    await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: "Updating executable...",
        cancellable: false,
      },
      () => {
        this.startLoad();
        return this.loadPromise;
      },
    );
  }
}
