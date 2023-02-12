import { Uri, workspace, WorkspaceConfiguration } from "vscode";

export function getJavaConfiguration(): WorkspaceConfiguration {
    return workspace.getConfiguration("java");
}

export function isRemote(f: string | null) {
    return (
        f !== null &&
        (f.startsWith("http:/") ||
            f.startsWith("https:/") ||
            f.startsWith("file:/"))
    );
}

export function getUriFromString(f: string) {
    return isRemote(f) ? Uri.parse(f) : Uri.file(f);
}
