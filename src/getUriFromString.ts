import { LogOutputChannel, Uri } from "vscode";
import { logFunction } from "./logFunction";

function isRemote(value: string | null) {
    return (
        value !== null &&
        (value.startsWith("http:/") ||
            value.startsWith("https:/") ||
            value.startsWith("file:/"))
    );
}

export const getUriFromString = logFunction(function getUriFromString(
    log: LogOutputChannel,
    value: string,
) {
    return isRemote(value) ? Uri.parse(value, true) : Uri.file(value);
});
