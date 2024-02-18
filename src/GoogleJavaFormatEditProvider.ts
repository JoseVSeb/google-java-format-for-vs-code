import {
    CancellationToken,
    DocumentFormattingEditProvider,
    DocumentRangeFormattingEditProvider,
    // ExtensionContext,
    FormattingOptions,
    LogOutputChannel,
    Range,
    TextDocument,
    TextEdit,
    window,
} from "vscode";
import { IGoogleJavaFormatter } from "./IGoogleJavaFormatter";

export default class GoogleJavaFormatEditProvider
    implements
        DocumentRangeFormattingEditProvider,
        DocumentFormattingEditProvider
{
    constructor(
        private formatter: IGoogleJavaFormatter,
        private log: LogOutputChannel,
    ) {}

    private formatText = async (
        text: string,
        range: Range,
        token: CancellationToken,
    ): Promise<string> => {
        const startTime = new Date().getTime();

        const controller = new AbortController();
        token.onCancellationRequested(controller.abort);

        const result = await this.formatter.format(
            text,
            [range.start.line + 1, range.end.line + 1],
            controller.signal,
        );

        const duration = new Date().getTime() - startTime;
        this.log.info(`Formatting completed in ${duration}ms.`);

        return result;
    };

    private errorHandler = (error: unknown): TextEdit[] => {
        const message =
            (error as Error)?.message ??
            "Failed to format java code using Google Java Format";

        this.log.error(message, error);
        window.showErrorMessage(message);

        return [];
    };

    public provideDocumentRangeFormattingEdits = async (
        document: TextDocument,
        range: Range,
        options: FormattingOptions,
        token: CancellationToken,
    ): Promise<TextEdit[]> => {
        const documentRange = new Range(0, 0, document.lineCount, 0);

        try {
            const textAfterFormat = await this.formatText(
                document.getText(),
                range,
                token,
            );
            return [TextEdit.replace(documentRange, textAfterFormat)];
        } catch (error) {
            return this.errorHandler(error);
        }
    };

    public provideDocumentFormattingEdits = async (
        document: TextDocument,
        options: FormattingOptions,
        token: CancellationToken,
    ): Promise<TextEdit[]> => {
        const documentRange = new Range(0, 0, document.lineCount, 0);

        try {
            const textAfterFormat = await this.formatText(
                document.getText(),
                documentRange,
                token,
            );
            return [TextEdit.replace(documentRange, textAfterFormat)];
        } catch (error) {
            return this.errorHandler(error);
        }
    };
}
