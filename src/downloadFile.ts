import fetch from "node-fetch";
import { LogOutputChannel, Uri, workspace } from "vscode";

export type DownloadFileOptions = {
    cacheDir: Uri;
    url: string;
    filename: string;
    log: LogOutputChannel;
};

export default async function downloadFile({
    cacheDir,
    url,
    filename,
    log,
}: DownloadFileOptions): Promise<Uri> {
    const localPath = Uri.joinPath(cacheDir, filename);

    try {
        // Check if the file is already cached locally
        await workspace.fs.stat(localPath);

        log.info(`Using cached file at ${localPath.toString()}`);

        return localPath;
    } catch (error) {
        // Create the cache directory if it doesn't exist
        try {
            await workspace.fs.createDirectory(cacheDir);
            log.debug(`Cache directory created at ${cacheDir.toString()}`);
        } catch (error) {
            log.error(`Failed to create cache directory: ${error}`);
            throw error;
        }

        // Download the file and write it to the cache directory
        log.info(`Downloading file from ${url}`);

        const response = await fetch(url);
        if (response.ok) {
            const buffer = await response.arrayBuffer();
            await workspace.fs.writeFile(localPath, new Uint8Array(buffer));

            log.info(`File saved to ${localPath.toString()}`);

            return localPath;
        } else {
            throw new Error(
                `Failed to download file from ${url}: ${response.status} ${response.statusText}`,
            );
        }
    }
}
