export interface IGoogleJavaFormatter {
    format(
        text: string,
        range?: [number, number],
        signal?: AbortSignal,
    ): Promise<string>;
}
