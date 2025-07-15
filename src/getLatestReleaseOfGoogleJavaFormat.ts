import { LogOutputChannel } from "vscode";
import { ExtensionConfiguration } from "./ExtensionConfiguration";
import { fetchWithSSLOptions } from "./fetchWithSSLOptions";
import {
    GoogleJavaFormatReleaseResponse,
    parseGoogleJavaFormatReleaseResponse,
} from "./GoogleJavaFormatRelease";
import { logAsyncFunction } from "./logFunction";

export const getLatestReleaseOfGoogleJavaFormat = logAsyncFunction(
    async function getLatestReleaseOfGoogleJavaFormat(
        log: LogOutputChannel,
        config: ExtensionConfiguration,
    ) {
        const url =
            "https://api.github.com/repos/google/google-java-format/releases/latest";
        log.debug("Fetching:", url);
        const response = await fetchWithSSLOptions(
            url,
            config.strictSSL ?? true,
            log,
        );
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
