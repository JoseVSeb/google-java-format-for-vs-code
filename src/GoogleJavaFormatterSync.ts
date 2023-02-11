import { execSync } from "child_process";
import { IGoogleJavaFormatter } from "./IGoogleJavaFormatter";

export default class GoogleJavaFormatterSync implements IGoogleJavaFormatter {
    constructor(private executable: string) {}

    public format(text: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            try {
                const stdout: string = execSync(
                    `java -jar ${this.executable} -`,
                    {
                        encoding: "utf8",
                        input: text,
                        maxBuffer: Infinity,
                        windowsHide: true,
                    },
                );
                resolve(stdout);
            } catch (e) {
                reject(e);
            }
        });
    }
}
