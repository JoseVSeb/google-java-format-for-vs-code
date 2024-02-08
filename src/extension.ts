import { ExtensionContext, window } from "vscode";
import getExtensionCacheFolder from "./getExtensionCacheFolder";
import getExtensionConfiguration from "./getExtensionConfiguration";
import getJarLocalPathFromConfig from "./getJarLocalPathFromConfig";
import GoogleJavaFormatEditProvider from "./GoogleJavaFormatEditProvider";
import GoogleJavaFormatEditService from "./GoogleJavaFormatEditService";
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

    const { extra } = config;

    const formatter: IGoogleJavaFormatter = new GoogleJavaFormatterSync(
        jarLocalPath,
        extra,
        log,
    );
    context.subscriptions.push(formatter.init());

    const editProvider = new GoogleJavaFormatEditProvider(formatter, log);

    const editService = new GoogleJavaFormatEditService(editProvider, log);
    context.subscriptions.push(editService.registerGlobal());
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate() {}
