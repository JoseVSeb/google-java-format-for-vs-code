import * as assert from "assert";
import * as vscode from "vscode";
import GoogleJavaFormatEditProvider from "../../GoogleJavaFormatEditProvider";
import GoogleJavaFormatEditService from "../../GoogleJavaFormatEditService";
import { IGoogleJavaFormatter } from "../../IGoogleJavaFormatter";

// Mock formatter for testing
class MockFormatter implements IGoogleJavaFormatter {
    async format(
        text: string,
        lines: [number, number],
        signal: AbortSignal,
    ): Promise<string> {
        return text; // Return text as-is for testing
    }
}

suite("GoogleJavaFormatEditService Test Suite", () => {
    let context: vscode.ExtensionContext;
    let log: vscode.LogOutputChannel;
    let editProvider: GoogleJavaFormatEditProvider;
    let editService: GoogleJavaFormatEditService;

    suiteSetup(() => {
        // Create mock context and log channel
        context = {
            subscriptions: [],
        } as any;

        log = {
            debug: () => {},
            info: () => {},
            error: () => {},
        } as any;

        const mockFormatter = new MockFormatter();
        editProvider = new GoogleJavaFormatEditProvider(mockFormatter, log);
        editService = new GoogleJavaFormatEditService(
            editProvider,
            context,
            log,
        );
    });

    test("Should register both DocumentFormattingEditProvider and DocumentRangeFormattingEditProvider", () => {
        // Clear any existing subscriptions
        context.subscriptions.length = 0;

        // Subscribe the edit service
        editService.subscribe();

        // Should have registered two providers
        assert.strictEqual(
            context.subscriptions.length,
            2,
            "Should register exactly 2 formatting providers",
        );
    });

    test("EditProvider should implement both required interfaces", () => {
        // Verify that the edit provider implements both required methods
        assert.ok(
            typeof editProvider.provideDocumentFormattingEdits === "function",
            "Should implement provideDocumentFormattingEdits method",
        );
        assert.ok(
            typeof editProvider.provideDocumentRangeFormattingEdits ===
                "function",
            "Should implement provideDocumentRangeFormattingEdits method",
        );
    });
});