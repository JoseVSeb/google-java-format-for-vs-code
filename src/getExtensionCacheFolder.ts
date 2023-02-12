import { ExtensionContext, Uri } from "vscode";

export default function getExtensionCacheFolder(
    context: ExtensionContext,
    cacheFolder = "cache",
): Uri {
    return Uri.joinPath(context.extensionUri, cacheFolder);
}
