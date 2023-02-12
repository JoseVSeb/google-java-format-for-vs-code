import { getJavaConfiguration } from "./utils";

export type GoogleJavaFormatConfiguration = {
    executable?: string;
    port: number;
    version?: string;
};

export default function getExtensionConfiguration(): GoogleJavaFormatConfiguration | null {
    return (
        getJavaConfiguration().get<GoogleJavaFormatConfiguration>(
            "format.settings.google",
        ) ?? null
    );
}
