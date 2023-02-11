import { ExtensionContext, window } from "vscode";
import GoogleJavaFormatEditProvider from "./GoogleJavaFormatEditProvider";
import GoogleJavaFormatEditService from "./GoogleJavaFormatEditService";
import GoogleJavaFormatterSync from "./GoogleJavaFormatterSync";
import { getJavaConfiguration } from "./utils";

export function activate(context: ExtensionContext) {
    const log = window.createOutputChannel("Google Java Format for VS Code", {
        log: true,
    });
    context.subscriptions.push(log);

    const executable = getJavaConfiguration().get<string>(
        "format.settings.google.executable",
    );

    if (!executable) {
        const message = "Google Java Format executable jar path not provided.";
        log.error(message);
        window.showErrorMessage(message);
        return;
    }

    const formatter = new GoogleJavaFormatterSync(executable);

    const editProvider = new GoogleJavaFormatEditProvider(formatter, log);

    const editService = new GoogleJavaFormatEditService(editProvider, log);

    editService.registerGlobal();
    context.subscriptions.push(editService);
}

// This method is called when your extension is deactivated
// TODO: Implement deactivation of google java format background service.
// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate() {}
