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

    private async formatText(text: string): Promise<string> {
        const startTime = new Date().getTime();

        const result = await this.formatter.format(text);

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
        const textBeforeFormat = document.getText(range);

        try {
            const textAfterFormat = await this.formatText(textBeforeFormat);
            return [TextEdit.replace(range, textAfterFormat)];
        } catch (error) {
            return this.errorHandler(error);
        }
    }

    public async provideDocumentFormattingEdits(
        document: TextDocument,
        options: FormattingOptions,
        token: CancellationToken,
    ): Promise<TextEdit[]> {
        const textBeforeFormat = document.getText();

        try {
            const textAfterFormat = await this.formatText(textBeforeFormat);
            return [
                TextEdit.replace(
                    new Range(0, 0, document.lineCount, 0),
                    textAfterFormat,
                ),
            ];
        } catch (error) {
            return this.errorHandler(error);
        }
    }
}
