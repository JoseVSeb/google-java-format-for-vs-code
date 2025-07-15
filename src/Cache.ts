import { createHash } from "node:crypto";
import path = require("node:path");
import {
    ExtensionContext,
    LogOutputChannel,
    Uri,
    commands,
    workspace,
} from "vscode";
import { fetchWithSSLOptions } from "./fetchWithSSLOptions";

export class Cache {
    private uri: Uri;

    private constructor(
        private context: ExtensionContext,
        private log: LogOutputChannel,
        cacheFolder: string,
        private strictSSL: boolean = true,
    ) {
        this.uri = Uri.joinPath(context.extensionUri, cacheFolder);
    }

    public static async getInstance(
        context: ExtensionContext,
        log: LogOutputChannel,
        cacheFolder = "cache",
        strictSSL: boolean = true,
    ) {
        const cache = new Cache(context, log, cacheFolder, strictSSL);
        await cache.init();
        return cache;
    }

    subscribe = () => {
        this.context.subscriptions.push(
            commands.registerCommand(
                "googleJavaFormatForVSCode.clearCache",
                this.clear,
            ),
        );
    };

    updateStrictSSL = (strictSSL: boolean) => {
        this.strictSSL = strictSSL;
    };

    clear = async () => {
        // clear cache
        await workspace.fs.delete(this.uri, { recursive: true });
        this.log.info("Cache cleared.");
        // reload executable after clearing cache
        await commands.executeCommand(
            "googleJavaFormatForVSCode.reloadExecutable",
        );
    };

    private init = async () => {
        // Create the cache directory if it doesn't exist
        try {
            await workspace.fs.createDirectory(this.uri);
            this.log.debug(`Cache directory created at ${this.uri.toString()}`);
        } catch (error) {
            this.log.error(`Failed to create cache directory: ${error}`);
            throw error;
        }
    };

    get = async (url: string) => {
        const basename = path.basename(url);

        const hash = createHash("md5").update(url).digest("hex");
        const dirname = Uri.joinPath(this.uri, hash);
        const localPath = Uri.joinPath(dirname, basename);

        try {
            // Check if the file is already cached locally
            await workspace.fs.stat(localPath);

            this.log.info(`Using cached file at ${localPath.toString()}`);

            return localPath;
        } catch (error) {
            // Create the cache directory if it doesn't exist
            try {
                await workspace.fs.createDirectory(dirname);
                this.log.debug(
                    `Cache directory created at ${dirname.toString()}`,
                );
            } catch (error) {
                this.log.error(`Failed to create cache directory: ${error}`);
                throw error;
            }

            // Download the file and write it to the cache directory
            this.log.info(`Downloading file from ${url}`);

            const response = await fetchWithSSLOptions(
                url,
                this.strictSSL,
                this.log,
            );
            if (response.ok) {
                const buffer = await response.arrayBuffer();
                await workspace.fs.writeFile(localPath, new Uint8Array(buffer));

                this.log.info(`File saved to ${localPath.toString()}`);

                return localPath;
            } else {
                throw new Error(
                    `Failed to download file from ${url}: ${response.status} ${response.statusText}`,
                );
            }
        }
    };
}
