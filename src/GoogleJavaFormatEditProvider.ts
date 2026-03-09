import type {
  CancellationToken,
  DocumentFormattingEditProvider,
  DocumentRangeFormattingEditProvider,
  FormattingOptions,
  LogOutputChannel,
  TextDocument,
} from "vscode";
import { Range, TextEdit, window } from "vscode";
import type { IGoogleJavaFormatter } from "./IGoogleJavaFormatter";
import { logAsyncMethod, logMethod } from "./logDecorator";

export default class GoogleJavaFormatEditProvider
  implements DocumentRangeFormattingEditProvider, DocumentFormattingEditProvider
{
  constructor(
    private formatter: IGoogleJavaFormatter,
    readonly log: LogOutputChannel,
  ) {
    this.formatText = this.formatText.bind(this);
    this.errorHandler = this.errorHandler.bind(this);
    this.provideDocumentRangeFormattingEdits = this.provideDocumentRangeFormattingEdits.bind(this);
    this.provideDocumentFormattingEdits = this.provideDocumentFormattingEdits.bind(this);
  }

  @logAsyncMethod
  private async formatText(text: string, range: Range, token: CancellationToken): Promise<string> {
    const startTime = Date.now();

    const controller = new AbortController();
    token.onCancellationRequested(controller.abort.bind(controller));

    const result = await this.formatter.format(
      text,
      [range.start.line + 1, range.end.line + 1],
      controller.signal,
    );

    const duration = Date.now() - startTime;
    this.log.info(`Formatting completed in ${duration}ms.`);

    return result;
  }

  @logMethod
  private errorHandler(error: unknown): TextEdit[] {
    const message =
      (error as Error)?.message ?? "Failed to format java code using Google Java Format";

    this.log.error(message, error as Error);
    window.showErrorMessage(message);

    return [];
  }

  @logAsyncMethod
  async provideDocumentRangeFormattingEdits(
    document: TextDocument,
    range: Range,
    _options: FormattingOptions,
    token: CancellationToken,
  ): Promise<TextEdit[]> {
    const documentRange = new Range(0, 0, document.lineCount, 0);

    try {
      const textAfterFormat = await this.formatText(document.getText(), range, token);
      return [TextEdit.replace(documentRange, textAfterFormat)];
    } catch (error) {
      return this.errorHandler(error);
    }
  }

  @logAsyncMethod
  async provideDocumentFormattingEdits(
    document: TextDocument,
    options: FormattingOptions,
    token: CancellationToken,
  ): Promise<TextEdit[]> {
    const range = new Range(0, 0, document.lineCount, 0);
    return this.provideDocumentRangeFormattingEdits(document, range, options, token);
  }
}
