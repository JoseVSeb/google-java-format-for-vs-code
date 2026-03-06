import { ExtensionContext, commands, window } from "vscode";
import { Cache } from "./Cache";
import { Executable, isSSLError } from "./Executable";
import { ExtensionConfiguration } from "./ExtensionConfiguration";
import GoogleJavaFormatEditProvider from "./GoogleJavaFormatEditProvider";
import GoogleJavaFormatEditService from "./GoogleJavaFormatEditService";
import GoogleJavaFormatterSync from "./GoogleJavaFormatterSync";

export async function activate(context: ExtensionContext) {
    const log = window.createOutputChannel("Google Java Format for VS Code", {
        log: true,
    });
    context.subscriptions.push(log);

    const config = new ExtensionConfiguration(context);
    config.subscribe();

    const cache = await Cache.getInstance(context, log);
    cache.subscribe();

    const executable = await Executable.getInstance(
        context,
        config,
        cache,
        log,
    );
    executable.subscribe();

    if (executable.error) {
        const error = executable.error;
        const detail = isSSLError(error)
            ? "This may be caused by SSL certificate validation failure (e.g., behind a corporate proxy). "
            : "";
        const message = `Google Java Format: Failed to download the formatter executable. ${detail}You can manually download the JAR from https://github.com/google/google-java-format/releases and set the path in the "java.format.settings.google.executable" setting.`;
        log.error(message, error);
        window
            .showErrorMessage(message, "Open Settings")
            .then((selection) => {
                if (selection === "Open Settings") {
                    commands.executeCommand(
                        "workbench.action.openSettings",
                        "java.format.settings.google.executable",
                    );
                }
            });
    }

    const formatter = new GoogleJavaFormatterSync(executable, config, log);
    const editProvider = new GoogleJavaFormatEditProvider(formatter, log);
    const editService = new GoogleJavaFormatEditService(
        editProvider,
        context,
        log,
    );
    editService.subscribe();
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate() {}
