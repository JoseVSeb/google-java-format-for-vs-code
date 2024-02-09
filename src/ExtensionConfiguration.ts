import { Uri } from "vscode";
import { getJavaConfiguration } from "./utils";

export type GoogleJavaFormatVersion =
    | `${number}.${number}.${number}`
    | "latest";

export interface GoogleJavaFormatConfiguration {
    executable?: string;
    version?: GoogleJavaFormatVersion;
    extra?: string;
    jarUri: Uri;
}

export class ExtensionConfiguration implements GoogleJavaFormatConfiguration {
    readonly executable?: string;
    readonly version?: GoogleJavaFormatVersion;
    readonly extra?: string;
    jarUri: Uri = null!;

    constructor() {
        return new Proxy(this, this.handler);
    }

    private handler: ProxyHandler<ExtensionConfiguration> = {
        get(target, prop) {
            if (prop === "jarUri") {
                return target[prop];
            }

            return getJavaConfiguration().get(
                `format.settings.google.${String(prop)}`,
            );
        },
    };
}
