import { execSync } from "node:child_process";
import {
    // CancellationToken,
    ExtensionContext,
    LogOutputChannel,
    // Progress,
    ProgressLocation,
    commands,
    window,
} from "vscode";
import { Cache } from "./Cache";
import { ExtensionConfiguration } from "./ExtensionConfiguration";
import { resolveExecutableFileFromConfig } from "./resolveExecutableFileFromConfig";
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
        this.context.subscriptions.push(
            commands.registerCommand(
                "googleJavaFormatForVSCode.reloadExecutable",
                this.load,
            ),
        );
    };

    private load = async () =>
        // progress?: Progress<{
        //     message?: string | undefined;
        //     increment?: number | undefined;
        // }>,
        // token?: CancellationToken,
        {
            const uri = await resolveExecutableFileFromConfig(
                this.config,
                this.log,
            );

            const { fsPath } =
                uri.scheme === "file"
                    ? uri
                    : await this.cache.get(uri.toString());

            const isJar = fsPath.endsWith(".jar");
            const dirname = path.dirname(fsPath);
            const basename = path.basename(fsPath);

            if (isJar) {
                this.runner = `java -jar ./${basename}`;
            } else if (process.platform === "win32") {
                this.runner = basename;
            } else {
                this.runner = `./${basename}`;
            }

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
