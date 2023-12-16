import { Disposable } from "vscode";

export interface IGoogleJavaFormatter extends Disposable {
    format(text: string, range?: [number, number]): Promise<string>;
    init(): Disposable;
}
