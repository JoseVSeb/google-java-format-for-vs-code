import { Disposable } from "vscode";

export interface IGoogleJavaFormatter extends Disposable {
    format(text: string): Promise<string>;
    init(): void;
}
