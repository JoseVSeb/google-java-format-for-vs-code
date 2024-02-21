import { LogOutputChannel } from "vscode";
import { GoogleJavaFormatVersion } from "./ExtensionConfiguration";
import {
    GoogleJavaFormatReleaseResponse,
    parseGoogleJavaFormatReleaseResponse,
} from "./GoogleJavaFormatRelease";
import { logAsyncFunction } from "./logFunction";

export const getReleaseOfGoogleJavaFormatByVersion = logAsyncFunction(
    async function getReleaseOfGoogleJavaFormatByVersion(
        log: LogOutputChannel,
        version: Exclude<GoogleJavaFormatVersion, "latest">,
    ) {
        const url = `https://api.github.com/repos/google/google-java-format/releases/tags/v${version}`;
        log.debug("Fetching:", url);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to get v${version} of Google Java Format.`);
        }

        return parseGoogleJavaFormatReleaseResponse(
            (await response.json()) as GoogleJavaFormatReleaseResponse,
        );
    },
);
