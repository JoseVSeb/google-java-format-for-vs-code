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

export function isSSLError(error: Error): boolean {
    return /certificate|ssl|tls|CERT_|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER/i.test(
        error.message,
    );
}

export class Executable {
    private runner: string = null!;
    private cwd: string = null!;
    private loadError: Error | null = null;

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
        try {
            await instance.load();
        } catch (error) {
            // loadError is already set by load(); activation continues gracefully
            instance.log.error("Failed to load executable:", error);
        }
        return instance;
    }

    get error() {
        return this.loadError;
    }

    run = async ({
        args,
        stdin,
    }: {
        args: string[];
        stdin: string;
        signal?: AbortSignal;
    }) => {
        if (this.loadError) {
            const hint = isSSLError(this.loadError)
                ? ` This may be caused by SSL certificate validation failure (e.g., behind a corporate proxy). Try setting "java.format.settings.google.executable" to a local path of the downloaded JAR file.`
                : ` Try reloading the executable or setting "java.format.settings.google.executable" to a local path of the downloaded JAR file.`;
            throw new Error(
                `Google Java Format executable failed to load: ${this.loadError.message}.${hint}`,
            );
        }
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
                async () => {
                    try {
                        await this.load();
                    } catch (error) {
                        const message =
                            error instanceof Error
                                ? error.message
                                : String(error);
                        window.showErrorMessage(
                            `Google Java Format: Failed to reload executable: ${message}`,
                        );
                    }
                },
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
            try {
                const uri = await resolveExecutableFileFromConfig(
                    this.config,
                    this.log,
                    this.context,
                );

                const { fsPath } =
                    uri.scheme === "file"
                        ? uri
                        : await this.cache.get(uri.toString());

                const isJar = fsPath.endsWith(".jar");
                this.cwd = path.dirname(fsPath);
                const basename = path.basename(fsPath);

                this.log.debug(
                    `Setting current working directory: ${this.cwd}`,
                );

                await this.enableExecutionPermission(basename);

                if (isJar) {
                    this.runner = `java -jar ./${basename}`;
                } else if (process.platform === "win32") {
                    this.runner = basename;
                } else {
                    this.runner = `./${basename}`;
                }

                this.loadError = null;
            } catch (error) {
                this.loadError =
                    error instanceof Error ? error : new Error(String(error));
                throw error;
            }
        };

    private enableExecutionPermission = async (basename: string) => {
        if (basename.endsWith(".jar")) {
            return;
        }

        // chmod +x for linux and mac native executables
        if (
            (["linux", "darwin"] as NodeJS.Platform[]).includes(
                process.platform,
            )
        ) {
            const command = `chmod +x ${basename}`;

            this.log.debug(`> ${command}`);

            execSync(command, { cwd: this.cwd });
        }
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
            async () => {
                try {
                    await this.load();
                } catch (error) {
                    const message =
                        error instanceof Error ? error.message : String(error);
                    window.showErrorMessage(
                        `Google Java Format: Failed to update executable: ${message}`,
                    );
                }
            },
        );
    };
}
