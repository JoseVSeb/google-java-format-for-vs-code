import { execSync } from "child_process";
import { Disposable, DocumentSelector, languages } from "vscode";
import GoogleJavaFormatEditProvider from "./GoogleJavaFormatEditProvider";
import { ILogService } from "./LogService";
import { getJavaConfiguration } from "./utils";

// export type FormatTextOptions = {
//     signal?: AbortSignal;
// };

export default class GoogleJavaFormatEditService implements Disposable {
    private formatterHandler: Disposable | undefined;

    private get selector(): DocumentSelector {
        return { language: "java" };
    }

    constructor(private log: ILogService) {}

    public registerGlobal() {
        this.registerDocumentFormatEditorProviders(this.selector);
        this.log.debug(
            "Enabling Google Java Formatter globally",
            this.selector,
        );
    }

    public dispose() {
        this.formatterHandler?.dispose();
        this.formatterHandler = undefined;
    }

    private registerDocumentFormatEditorProviders(selector: DocumentSelector) {
        this.dispose();

        const editProvider = new GoogleJavaFormatEditProvider(
            this.formatText,
            this.log,
        );

        this.formatterHandler =
            languages.registerDocumentRangeFormattingEditProvider(
                selector,
                editProvider,
            );
    }

    private async formatText(text: string): Promise<string> {
        const startTime = new Date().getTime();

        const result = await new Promise<string>((resolve, reject) => {
            try {
                const stdout: string = execSync(
                    `java -jar ${getJavaConfiguration().get<string>(
                        "format.settings.google.executable",
                    )} -`,
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

        const duration = new Date().getTime() - startTime;
        this.log.info(`Formatting completed in ${duration}ms.`);

        return result;
    }
}
