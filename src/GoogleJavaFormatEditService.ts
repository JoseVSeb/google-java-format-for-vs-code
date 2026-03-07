import type {
  DocumentRangeFormattingEditProvider,
  DocumentSelector,
  ExtensionContext,
  LogOutputChannel,
} from "vscode";
import { languages } from "vscode";
import { logMethod } from "./logDecorator";

export default class GoogleJavaFormatEditService {
  private readonly selector: DocumentSelector = { language: "java" };

  constructor(
    private editProvider: DocumentRangeFormattingEditProvider,
    private context: ExtensionContext,
    readonly log: LogOutputChannel,
  ) {}

  @logMethod
  subscribe() {
    this.context.subscriptions.push(
      languages.registerDocumentRangeFormattingEditProvider(this.selector, this.editProvider),
    );
    this.log.debug("Enabled Google Java Formatter globally", this.selector);
  }
}
