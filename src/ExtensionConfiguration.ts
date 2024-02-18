import { ConfigurationChangeEvent, ExtensionContext, workspace } from "vscode";

const SECTION = `java.format.settings.google`;

export type GoogleJavaFormatVersion =
    | `${number}.${number}.${number}`
    | "latest";

export type GoogleJavaFormatMode = "jar-file" | "native-binary"; // | "background-service"

export interface GoogleJavaFormatConfiguration {
    executable?: string;
    version?: GoogleJavaFormatVersion;
    mode?: GoogleJavaFormatMode;
    extra?: string;
}

export class ExtensionConfiguration implements GoogleJavaFormatConfiguration {
    executable?: string;
    version?: GoogleJavaFormatVersion;
    mode?: GoogleJavaFormatMode;
    extra?: string;
    readonly subscriptions: ((
        config: GoogleJavaFormatConfiguration,
    ) => void)[] = [];

    constructor(private context: ExtensionContext) {
        this.load();
    }

    subscribe = () => {
        this.context.subscriptions.push(
            workspace.onDidChangeConfiguration(
                this.configurationChangeListener,
            ),
        );
    };

    private load = () => {
        const { subscriptions, ...config } =
            workspace.getConfiguration(SECTION);
        Object.assign(this, config);
    };

    private configurationChangeListener = async (
        event: ConfigurationChangeEvent,
    ) => {
        if (!event.affectsConfiguration(SECTION)) {
            return;
        }

        this.load();
        this.subscriptions.forEach((fn) => fn(this));
    };
}
