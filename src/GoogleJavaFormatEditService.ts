import {
    Disposable,
    DocumentRangeFormattingEditProvider,
    DocumentSelector,
    languages,
    LogOutputChannel,
} from "vscode";

export default class GoogleJavaFormatEditService implements Disposable {
    private formatterHandler: Disposable | undefined;

    private get selector(): DocumentSelector {
        return { language: "java" };
    }

    constructor(
        private editProvider: DocumentRangeFormattingEditProvider,
        private log: LogOutputChannel,
    ) {}

    public registerGlobal(): Disposable {
        this.registerDocumentFormatEditorProviders(this.selector);
        this.log.debug(
            "Enabling Google Java Formatter globally",
            this.selector,
        );

        return this;
    }

    public dispose() {
        this.formatterHandler?.dispose();
        this.formatterHandler = undefined;
    }

    private registerDocumentFormatEditorProviders(selector: DocumentSelector) {
        this.dispose();

        this.formatterHandler =
            languages.registerDocumentRangeFormattingEditProvider(
                selector,
                this.editProvider,
            );
    }
}
