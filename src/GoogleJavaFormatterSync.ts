import { execSync } from "child_process";
import { IGoogleJavaFormatter } from "./IGoogleJavaFormatter";
import { LogOutputChannel } from "vscode";
import { GoogleJavaFormatConfiguration } from "./ExtensionConfiguration";

export default class GoogleJavaFormatterSync implements IGoogleJavaFormatter {
    constructor(
        private config: GoogleJavaFormatConfiguration,
        private log: LogOutputChannel,
    ) {}

    dispose() {
        return;
    }

    init() {
        return this;
    }

    public format(text: string, range?: [number, number]): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            try {
                let command = `java -jar ${this.config.jarUri.fsPath}`;

                if (this.config.extra) {
                    command += ` ${this.config.extra}`;
                }

                if (range) {
                    command += ` --lines ${range[0]}:${range[1]}`;
                }

                command += " -";

                this.log.debug(`> ${command}`);

                const stdout: string = execSync(command, {
                    encoding: "utf8",
                    input: text,
                    maxBuffer: Infinity,
                    windowsHide: true,
                });
                resolve(stdout);
            } catch (e) {
                reject(e);
            }
        });
    }
}
