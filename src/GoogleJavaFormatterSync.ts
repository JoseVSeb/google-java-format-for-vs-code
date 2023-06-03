import { execSync } from "child_process";
import { IGoogleJavaFormatter } from "./IGoogleJavaFormatter";

export default class GoogleJavaFormatterSync implements IGoogleJavaFormatter {
    constructor(private executable: string, private extra?: string) {}

    dispose() {
        return;
    }

    init() {
        return this;
    }

    public format(text: string, range?: [number, number]): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            try {
                let command = `java -jar ${this.executable}`;

                if (this.extra) {
                    command += ` ${this.extra}`;
                }

                if (range) {
                    command += ` --lines ${range[0]}:${range[1]}`;
                }

                command += " -";

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
