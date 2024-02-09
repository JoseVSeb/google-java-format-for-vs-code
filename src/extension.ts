import {
    ConfigurationChangeEvent,
    ExtensionContext,
    ProgressLocation,
    window,
    workspace,
} from "vscode";
import { ExtensionConfiguration } from "./ExtensionConfiguration";
import GoogleJavaFormatEditProvider from "./GoogleJavaFormatEditProvider";
import GoogleJavaFormatEditService from "./GoogleJavaFormatEditService";
import GoogleJavaFormatterSync from "./GoogleJavaFormatterSync";
import getExtensionCacheFolder from "./getExtensionCacheFolder";
import getJarLocalPathFromConfig from "./getJarLocalPathFromConfig";

export async function activate(context: ExtensionContext) {
    const log = window.createOutputChannel("Google Java Format for VS Code", {
        log: true,
    });
    context.subscriptions.push(log);

    const config = new ExtensionConfiguration();
    const cacheDir = getExtensionCacheFolder(context);

    const configureJarFile = async () => {
        config.jarUri = await getJarLocalPathFromConfig({
            cacheDir,
            log,
            config,
        });
    };
    await configureJarFile();

    const configurationChangeListener = async (
        event: ConfigurationChangeEvent,
    ) => {
        if (
            // check if configuration updated
            !event.affectsConfiguration("java.format.settings.google")
        ) {
            // jar update not needed
            return;
        }

        log.info("Configuration change detected.");
        const action = await window.showInformationMessage(
            "Configuration change detected. Update jar file?",
            "Update",
            "Ignore",
        );

        if (action !== "Update") {
            log.debug("Change ignored.");
            return;
        }

        log.debug("Updating jar file...");
        window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: "Updating jar file...",
                cancellable: false,
            },
            configureJarFile,
        );
    };
    context.subscriptions.push(
        workspace.onDidChangeConfiguration(configurationChangeListener),
    );

    const formatter = new GoogleJavaFormatterSync(config, log);
    context.subscriptions.push(formatter.init());

    const editProvider = new GoogleJavaFormatEditProvider(formatter, log);

    const editService = new GoogleJavaFormatEditService(editProvider, log);
    context.subscriptions.push(editService.registerGlobal());
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate() {}
