import {
    CancellationToken,
    DocumentFormattingEditProvider,
    DocumentRangeFormattingEditProvider,
    FormattingOptions,
    Range,
    TextDocument,
    TextEdit,
    window,
} from "vscode";
import { ILogService } from "./LogService";

export default class GoogleJavaFormatEditProvider
    implements
        DocumentRangeFormattingEditProvider,
        DocumentFormattingEditProvider
{
    constructor(
        private formatText: (text: string) => Promise<string>,
        private log: ILogService,
    ) {}

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
