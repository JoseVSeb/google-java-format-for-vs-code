import { getJavaConfiguration } from "./utils";

export type GoogleJavaFormatConfiguration = {
    executable?: string;
    version?: string;
    extra?: string;
};

export default function getExtensionConfiguration(): GoogleJavaFormatConfiguration | null {
    return (
        getJavaConfiguration().get<GoogleJavaFormatConfiguration>(
            "format.settings.google",
        ) ?? null
    );
}
