import { LogOutputChannel, Uri } from "vscode";
import { GoogleJavaFormatConfiguration } from "./ExtensionConfiguration";
import {
    downloadGoogleJavaFormatJar,
    downloadGoogleJavaFormatJarByVersion,
} from "./downloadGoogleJavaFormatJar";
import { getListOfGoogleJavaFormatVersions } from "./getListOfGoogleJavaFormatVersions";
import { getUriFromString } from "./getUriFromString";

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

    if (version && version !== "latest") {
        log.debug(`Retrieving jar file using 'version' config: ${version}`);
        return downloadGoogleJavaFormatJarByVersion({
            version,
            cacheDir,
            log,
        });
    }

    log.debug(`Retrieving list of available versions`);
    const [{ major, minor, patch }] = await getListOfGoogleJavaFormatVersions();
    const latestVersion = `${major}.${minor}.${patch}` as const;

    log.debug(`Retrieving jar file for latest version (${latestVersion})`);
    return downloadGoogleJavaFormatJarByVersion({
        version: latestVersion,
        cacheDir,
        log,
    });
}
