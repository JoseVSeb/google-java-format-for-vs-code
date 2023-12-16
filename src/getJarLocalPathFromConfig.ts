import { LogOutputChannel, Uri } from "vscode";
import {
    downloadGoogleJavaFormatJar,
    downloadGoogleJavaFormatJarByVersion,
} from "./downloadGoogleJavaFormatJar";
import { GoogleJavaFormatConfiguration } from "./getExtensionConfiguration";
import { getUriFromString } from "./utils";

export type GetJarLocalPathFromConfigOptions = {
    cacheDir: Uri;
    log: LogOutputChannel;
    config: GoogleJavaFormatConfiguration;
};

export default async function getJarLocalPathFromConfig({
    cacheDir,
    log,
    config: { executable, version },
}: GetJarLocalPathFromConfigOptions): Promise<Uri> {
    if (executable) {
        log.debug(
            `Retrieving jar file from 'executable' config: ${executable}`,
        );
        const jarUri = getUriFromString(executable);

        if (jarUri.scheme === "file") {
            log.info(`Using local jar file ${jarUri.toString()}`);
            return jarUri;
        }

        return downloadGoogleJavaFormatJar({
            url: jarUri.toString(),
            cacheDir,
            log,
        });
    }

    if (version) {
        log.debug(`Retrieving jar file using 'version' config: ${version}`);
        return downloadGoogleJavaFormatJarByVersion({
            version,
            cacheDir,
            log,
        });
    }

    log.debug(`Retrieving jar file using default version: 1.18.1`);
    return downloadGoogleJavaFormatJarByVersion({
        version: version || "1.18.1",
        cacheDir,
        log,
    });
}
