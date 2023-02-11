import { ExtensionContext } from "vscode";
import GoogleJavaFormatEditService from "./GoogleJavaFormatEditService";
import LogService from "./LogService";

export function activate(context: ExtensionContext) {
    const log = new LogService();

    const editService = new GoogleJavaFormatEditService(log);

    editService.registerGlobal();
    context.subscriptions.push(editService);
}

// This method is called when your extension is deactivated
// TODO: Implement deactivation of google java format background service.
// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate() {}
