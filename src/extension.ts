import { ExtensionContext, window } from "vscode";
import { Cache } from "./Cache";
import { Executable } from "./Executable";
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

    const cache = await Cache.getInstance(
        context,
        log,
        "cache",
        config.strictSSL ?? true,
    );
    cache.subscribe();

    // Subscribe to configuration changes for cache SSL settings
    config.subscriptions.push((newConfig) => {
        cache.updateStrictSSL(newConfig.strictSSL ?? true);
    });

    const executable = await Executable.getInstance(
        context,
        config,
        cache,
        log,
    );
    executable.subscribe();

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
