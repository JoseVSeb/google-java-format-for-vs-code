import { ExtensionContext, window } from "vscode";
import getExtensionCacheFolder from "./getExtensionCacheFolder";
import getExtensionConfiguration from "./getExtensionConfiguration";
import getJarLocalPathFromConfig from "./getJarLocalPathFromConfig";
import GoogleJavaFormatEditProvider from "./GoogleJavaFormatEditProvider";
import GoogleJavaFormatEditService from "./GoogleJavaFormatEditService";
import GoogleJavaFormatterBackgroundService from "./GoogleJavaFormatterBackgroundService";
import GoogleJavaFormatterSync from "./GoogleJavaFormatterSync";
import { IGoogleJavaFormatter } from "./IGoogleJavaFormatter";

export async function activate(context: ExtensionContext) {
    const log = window.createOutputChannel("Google Java Format for VS Code", {
        log: true,
    });
    context.subscriptions.push(log);

    const config = getExtensionConfiguration();
    const cacheDir = getExtensionCacheFolder(context);

    if (!config) {
        const message =
            "Google Java Format for VS Code extension configuration not found.";
        log.error(message);
        window.showErrorMessage(message);
        return;
    }

    const jarLocalPath = await getJarLocalPathFromConfig({
        cacheDir,
        log,
        config,
    }).then((uri) => uri.fsPath);

    const { port } = config;

    const formatter: IGoogleJavaFormatter =
        port >= 0
            ? new GoogleJavaFormatterBackgroundService(jarLocalPath, port, log)
            : new GoogleJavaFormatterSync(jarLocalPath);

    formatter.init();
    context.subscriptions.push(formatter);

    const editProvider = new GoogleJavaFormatEditProvider(formatter, log);

    const editService = new GoogleJavaFormatEditService(editProvider, log);

    editService.registerGlobal();
    context.subscriptions.push(editService);
}

// This method is called when your extension is deactivated
// TODO: Implement deactivation of google java format background service.
// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate() {}
