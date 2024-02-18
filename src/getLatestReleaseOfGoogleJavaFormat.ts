import {
    GoogleJavaFormatReleaseResponse,
    parseGoogleJavaFormatReleaseResponse,
} from "./GoogleJavaFormatRelease";

export const getLatestReleaseOfGoogleJavaFormat = async () => {
    const response = await fetch(
        "https://api.github.com/repos/google/google-java-format/releases/latest",
    );
    if (!response.ok) {
        throw new Error("Failed to get latest release of Google Java Format.");
    }

    return parseGoogleJavaFormatReleaseResponse(
        (await response.json()) as GoogleJavaFormatReleaseResponse,
    );
};
