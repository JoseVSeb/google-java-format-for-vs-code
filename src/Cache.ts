import { ExtensionContext, LogOutputChannel, Uri, workspace } from "vscode";

export class Cache {
    private uri: Uri;
    private constructor(
        context: ExtensionContext,
        private log: LogOutputChannel,
        cacheFolder: string,
    ) {
        this.uri = Uri.joinPath(context.extensionUri, cacheFolder);
    }

    public static async getInstance(
        context: ExtensionContext,
        log: LogOutputChannel,
        cacheFolder = "cache",
    ) {
        const cache = new Cache(context, log, cacheFolder);
        await cache.init();
        // TODO: clear old cache
        return cache;
    }

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

    // TODO: remove this
    get dir(): Uri {
        return this.uri;
    }
}
