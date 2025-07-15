import {
    DocumentFormattingEditProvider,
    DocumentRangeFormattingEditProvider,
    DocumentSelector,
    ExtensionContext,
    languages,
    LogOutputChannel,
} from "vscode";

export default class GoogleJavaFormatEditService {
    private readonly selector: DocumentSelector = { language: "java" };

    constructor(
        private editProvider: DocumentRangeFormattingEditProvider &
            DocumentFormattingEditProvider,
        private context: ExtensionContext,
        private log: LogOutputChannel,
    ) {}

    public subscribe = () => {
        this.context.subscriptions.push(
            languages.registerDocumentRangeFormattingEditProvider(
                this.selector,
                this.editProvider,
            ),
        );
        this.context.subscriptions.push(
            languages.registerDocumentFormattingEditProvider(
                this.selector,
                this.editProvider,
            ),
        );
        this.log.debug("Enabled Google Java Formatter globally", this.selector);
    };
}
