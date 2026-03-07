import type { LogOutputChannel } from "vscode";
import type { Executable } from "./Executable";
import type { ExtensionConfiguration } from "./ExtensionConfiguration";
import type { IGoogleJavaFormatter } from "./IGoogleJavaFormatter";
import { logAsyncMethod } from "./logDecorator";

export default class GoogleJavaFormatterSync implements IGoogleJavaFormatter {
  constructor(
    private executable: Executable,
    private config: ExtensionConfiguration,
    readonly log: LogOutputChannel,
  ) {}

  @logAsyncMethod
  async format(text: string, range?: [number, number], signal?: AbortSignal): Promise<string> {
    const args: string[] = [];

    if (this.config.extra) {
      args.push(this.config.extra);
    }

    if (range) {
      args.push(`--lines ${range[0]}:${range[1]}`);
    }

    return this.executable.run({ args, stdin: text, signal });
  }
}
