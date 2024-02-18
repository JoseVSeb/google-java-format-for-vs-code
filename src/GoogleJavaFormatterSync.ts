import { LogOutputChannel } from "vscode";
import { Executable } from "./Executable";
import { ExtensionConfiguration } from "./ExtensionConfiguration";
import { IGoogleJavaFormatter } from "./IGoogleJavaFormatter";

export default class GoogleJavaFormatterSync implements IGoogleJavaFormatter {
    constructor(
        private executable: Executable,
        private config: ExtensionConfiguration,
        private log: LogOutputChannel,
    ) {}

    public format = async (
        text: string,
        range?: [number, number],
        signal?: AbortSignal,
    ): Promise<string> => {
        const args = [];

        if (this.config.extra) {
            args.push(this.config.extra);
        }

        if (range) {
            args.push(`--lines ${range[0]}:${range[1]}`);
        }

        return this.executable.run({
            args,
            stdin: text,
            signal,
        });
    };
}
