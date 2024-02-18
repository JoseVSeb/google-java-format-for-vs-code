import { GoogleJavaFormatVersion } from "./ExtensionConfiguration";
import {
    GoogleJavaFormatReleaseResponse,
    parseGoogleJavaFormatReleaseResponse,
} from "./GoogleJavaFormatRelease";

export const getReleaseOfGoogleJavaFormatByVersion = async (
    version: Exclude<GoogleJavaFormatVersion, "latest">,
) => {
    const response = await fetch(
        `https://api.github.com/repos/google/google-java-format/releases/tags/v${version}`,
    );
    if (!response.ok) {
        throw new Error(`Failed to get v${version} of Google Java Format.`);
    }

    return parseGoogleJavaFormatReleaseResponse(
        (await response.json()) as GoogleJavaFormatReleaseResponse,
    );
};
