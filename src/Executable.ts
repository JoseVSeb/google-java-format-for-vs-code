import { execSync } from "node:child_process";
import {
    // CancellationToken,
    ExtensionContext,
    LogOutputChannel,
    // Progress,
    ProgressLocation,
    window,
} from "vscode";
import { Cache } from "./Cache";
import { ExtensionConfiguration } from "./ExtensionConfiguration";
import getJarLocalPathFromConfig from "./getJarLocalPathFromConfig";
import path = require("node:path");

export class Executable {
    private runner: string = null!;
    private cwd: string = null!;

    private constructor(
        private context: ExtensionContext,
        private config: ExtensionConfiguration,
        private cache: Cache,
        private log: LogOutputChannel,
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

    run = async ({
        args,
        stdin,
    }: {
        args: string[];
        stdin: string;
        signal?: AbortSignal;
    }) => {
        return new Promise<string>((resolve, reject) => {
            try {
                const command = `${this.runner} ${args.join(" ")} -`;

                this.log.debug(`> ${command}`);

                const stdout: string = execSync(command, {
                    cwd: this.cwd,
                    encoding: "utf8",
                    input: stdin,
                    maxBuffer: Infinity,
                    windowsHide: true,
                });

                resolve(stdout);
            } catch (e) {
                reject(e);
            }
        });
    };

    subscribe = () => {
        this.config.subscriptions.push(this.configurationChangeListener);
    };

    private load = async () =>
        // progress?: Progress<{
        //     message?: string | undefined;
        //     increment?: number | undefined;
        // }>,
        // token?: CancellationToken,
        {
            // TODO: move caching logic to class Cache
            // TODO: move versioning logic to class GoogleJavaFormatVersionManager
            const { fsPath } = await getJarLocalPathFromConfig({
                cacheDir: this.cache.dir,
                log: this.log,
                config: this.config,
            });

            const extname = path.extname(fsPath);
            const basename = path.basename(fsPath);
            const dirname = path.dirname(fsPath);

            this.runner =
                extname === ".jar" ? `java -jar ${basename}` : extname;

            this.cwd = dirname;
        };

    private configurationChangeListener = async () => {
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
    };
}