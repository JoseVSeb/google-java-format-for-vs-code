import path = require("path");
import { LogOutputChannel, Uri } from "vscode";
import downloadFile from "./downloadFile";

export type DownloadGoogleJavaFormatJarByVersionOptions = {
    version: string;
    cacheDir: Uri;
    log: LogOutputChannel;
};

export function downloadGoogleJavaFormatJarByVersion({
    version,
    cacheDir,
    log,
}: DownloadGoogleJavaFormatJarByVersionOptions): Promise<Uri> {
    return downloadGoogleJavaFormatJar({
        url: `https://github.com/google/google-java-format/releases/download/v${version}/google-java-format-${version}-all-deps.jar`,
        cacheDir,
        log,
    });
}

export type DownloadGoogleJavaFormatJarOptions = {
    url: string;
    cacheDir: Uri;
    log: LogOutputChannel;
};

export function downloadGoogleJavaFormatJar({
    url,
    cacheDir,
    log,
}: DownloadGoogleJavaFormatJarOptions): Promise<Uri> {
    const filename = path.basename(url);

    return downloadFile({
        cacheDir,
        url,
        filename,
        log,
    });
}
