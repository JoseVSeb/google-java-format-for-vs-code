import { Uri } from "vscode";

export function getUriFromString(value: string) {
    try {
        return Uri.parse(value, true);
    } catch (e) {
        return Uri.file(value);
    }
}
