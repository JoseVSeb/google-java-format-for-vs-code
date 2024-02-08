import { getJavaConfiguration } from "./utils";

export interface GoogleJavaFormatConfiguration {
    executable?: string;
    version?: string;
    extra?: string;
}

export class ExtensionConfiguration implements GoogleJavaFormatConfiguration {
    readonly executable?: string;
    readonly version?: string;
    readonly extra?: string;

    constructor() {
        return new Proxy(this, this.handler);
    }

    private handler: ProxyHandler<ExtensionConfiguration> = {
        get(target, prop) {
            return getJavaConfiguration().get(
                `format.settings.google.${String(prop)}`,
            );
        },
    };
}
