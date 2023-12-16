import {
    CancellationToken,
    DocumentFormattingEditProvider,
    DocumentRangeFormattingEditProvider,
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

    private async formatText(text: string, range: Range): Promise<string> {
        const startTime = new Date().getTime();

        const result = await this.formatter.format(text, [
            range.start.line + 1,
            range.end.line + 1,
        ]);

        const duration = new Date().getTime() - startTime;
        this.log.info(`Formatting completed in ${duration}ms.`);

        return result;
    }

    private errorHandler(error: unknown): TextEdit[] {
        const message =
            (error as Error)?.message ??
            "Failed to format java code using Google Java Format";

        this.log.error(message, error);
        window.showErrorMessage(message);

        return [];
    }

    public async provideDocumentRangeFormattingEdits(
        document: TextDocument,
        range: Range,
        options: FormattingOptions,
        token: CancellationToken,
    ): Promise<TextEdit[]> {
        const documentRange = new Range(0, 0, document.lineCount, 0);

        try {
            const textAfterFormat = await this.formatText(document.getText(), range);
            return [TextEdit.replace(documentRange, textAfterFormat)];
        } catch (error) {
            return this.errorHandler(error);
        }
    }

    public async provideDocumentFormattingEdits(
        document: TextDocument,
        options: FormattingOptions,
        token: CancellationToken,
    ): Promise<TextEdit[]> {
        const documentRange = new Range(0, 0, document.lineCount, 0);

        try {
            const textAfterFormat = await this.formatText(document.getText(), documentRange);
            return [TextEdit.replace(documentRange, textAfterFormat)];
        } catch (error) {
            return this.errorHandler(error);
        }
    }
}
