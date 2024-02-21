import { LogOutputChannel, Uri } from "vscode";
import { ExtensionConfiguration } from "./ExtensionConfiguration";
import { getLatestReleaseOfGoogleJavaFormat } from "./getLatestReleaseOfGoogleJavaFormat";
import { getReleaseOfGoogleJavaFormatByVersion } from "./getReleaseOfGoogleJavaFormatByVersion";
import { getUriFromString } from "./getUriFromString";

export async function resolveExecutableFileFromConfig(
    { executable, mode, version }: ExtensionConfiguration,
    log: LogOutputChannel,
): Promise<Uri> {
    if (executable) {
        log.debug(`Using config key 'executable': ${executable}`);

        return getUriFromString(log, executable);
    }

    const shouldCheckNativeBinary = mode === "native-binary";
    const system = `${process.platform}-${process.arch}` as const;
    if (shouldCheckNativeBinary) {
        log.debug(`Using native binary for ${system} if available`);
    }

    if (version === "latest") {
        log.debug(`Using latest version...`);
    }

    const { assets } =
        version && version !== "latest"
            ? await getReleaseOfGoogleJavaFormatByVersion(log, version)
            : await getLatestReleaseOfGoogleJavaFormat(log);

    const url =
        (shouldCheckNativeBinary && assets.get(system)) || assets.get("java")!;
    log.debug(`Using url: ${url}`);

    return Uri.parse(url);
}
