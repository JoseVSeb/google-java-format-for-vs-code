import { LogOutputChannel } from "vscode";
import {
    GoogleJavaFormatReleaseResponse,
    parseGoogleJavaFormatReleaseResponse,
} from "./GoogleJavaFormatRelease";
import { logAsyncFunction } from "./logFunction";

export const getLatestReleaseOfGoogleJavaFormat = logAsyncFunction(
    async function getLatestReleaseOfGoogleJavaFormat(log: LogOutputChannel) {
        const url =
            "https://api.github.com/repos/google/google-java-format/releases/latest";
        log.debug("Fetching:", url);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(
                "Failed to get latest release of Google Java Format.",
            );
        }

        return parseGoogleJavaFormatReleaseResponse(
            (await response.json()) as GoogleJavaFormatReleaseResponse,
        );
    },
);
