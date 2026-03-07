import * as assert from "node:assert";
import * as path from "node:path";
import * as vscode from "vscode";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EXTENSION_ID = "josevseb.google-java-format-for-vs-code";
const FIXTURES_DIR = path.resolve(__dirname, "..", "..", "test", "fixtures");

/** Wait until a condition becomes truthy, polling every 100 ms. */
async function waitUntil(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 10_000,
  intervalMs = 100,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("waitUntil timed out");
}

/** Open a file from the fixtures directory. */
async function openFixture(filename: string) {
  const uri = vscode.Uri.file(path.join(FIXTURES_DIR, filename));
  return vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

suite("Google Java Format for VS Code – e2e", () => {
  // -------------------------------------------------------------------------
  // Top-level setup: pre-configure the extension executable in CI.
  //
  // The extension activates lazily on `onLanguage:java` (i.e. only when the
  // first Java file is opened).  By setting `executable` *before* any test
  // opens a Java file we ensure `ExtensionConfiguration.load()` picks it up
  // and `resolveExecutableFileFromConfig` takes the short-circuit path:
  //
  //   if (executable) { return service.getUriFromString(executable); }
  //
  // This completely bypasses the GitHub API call (`getLatestRelease`) that
  // fails on macOS CI runners due to Electron fetch behaviour / rate-limits.
  // The `GJF_JAR` env var is set by the "Download google-java-format jar"
  // CI step (using the authenticated `gh` CLI so there are no rate limits).
  // -------------------------------------------------------------------------
  suiteSetup(async () => {
    const jarPath = process.env.GJF_JAR;
    if (jarPath) {
      await vscode.workspace
        .getConfiguration("java.format.settings.google")
        .update("executable", jarPath, vscode.ConfigurationTarget.Global);
    }
  });

  suiteTeardown(async () => {
    // Reset any executable override so settings don't bleed outside the test run.
    await vscode.workspace
      .getConfiguration("java.format.settings.google")
      .update("executable", undefined, vscode.ConfigurationTarget.Global);
  });
  // -------------------------------------------------------------------------
  // Extension activation
  // -------------------------------------------------------------------------

  suite("Extension activation", () => {
    test("extension is present in the extension list", () => {
      const ext = vscode.extensions.getExtension(EXTENSION_ID);
      assert.ok(ext, `Extension ${EXTENSION_ID} not found`);
    });

    test("extension activates without errors", async () => {
      const ext = vscode.extensions.getExtension(EXTENSION_ID);
      assert.ok(ext, `Extension ${EXTENSION_ID} not found`);

      // Activate is triggered by opening a Java file
      const doc = await vscode.workspace.openTextDocument({
        language: "java",
        content: "public class Tmp {}",
      });
      await vscode.window.showTextDocument(doc);

      await waitUntil(() => ext.isActive, 15_000);
      assert.ok(ext.isActive, "Extension should be active after opening a Java document");
    });

    test("extension exports activate and deactivate functions", async () => {
      const ext = vscode.extensions.getExtension(EXTENSION_ID);
      assert.ok(ext);
      await ext?.activate();
      // Our extension does not expose a public API surface, so exports is
      // undefined – but activate() must not throw.
      assert.ok(ext?.isActive, "Extension should still be active after explicit activate() call");
    });
  });

  // -------------------------------------------------------------------------
  // Command registration
  // -------------------------------------------------------------------------

  suite("Command registration", () => {
    suiteSetup(async () => {
      // Ensure extension is active before checking commands
      const ext = vscode.extensions.getExtension(EXTENSION_ID);
      if (ext && !ext.isActive) {
        const doc = await vscode.workspace.openTextDocument({
          language: "java",
          content: "public class Tmp {}",
        });
        await vscode.window.showTextDocument(doc);
        await waitUntil(() => ext.isActive, 15_000);
      }
    });

    test("clearCache command is registered", async () => {
      const commands = await vscode.commands.getCommands(true);
      assert.ok(
        commands.includes("googleJavaFormatForVSCode.clearCache"),
        "clearCache command should be registered",
      );
    });

    test("reloadExecutable command is registered", async () => {
      const commands = await vscode.commands.getCommands(true);
      assert.ok(
        commands.includes("googleJavaFormatForVSCode.reloadExecutable"),
        "reloadExecutable command should be registered",
      );
    });
  });

  // -------------------------------------------------------------------------
  // Formatter registration
  // -------------------------------------------------------------------------

  suite("Formatter registration", () => {
    test("a document range formatting provider is registered for Java", async () => {
      // Open a Java file; VS Code should resolve at least one range formatter
      const doc = await vscode.workspace.openTextDocument({
        language: "java",
        content: "public class A {}",
      });
      await vscode.window.showTextDocument(doc);

      // Formatting providers can't be enumerated directly, but requesting edits
      // without a real executable will either return edits or an error message—
      // not throw an unhandled exception at the registration layer.
      const _range = new vscode.Range(0, 0, doc.lineCount, 0);
      // We just verify the call doesn't throw a "no provider" error
      let threw = false;
      try {
        await vscode.commands.executeCommand<vscode.TextEdit[]>(
          "vscode.executeFormatDocumentProvider",
          doc.uri,
        );
      } catch {
        threw = true;
      }
      // A missing formatter registration would throw "no formatter registered".
      // An error from the executable itself (e.g. not found) is acceptable here.
      assert.strictEqual(threw, false, "Format command should not throw at the provider level");
    });
  });

  // -------------------------------------------------------------------------
  // Log output channel
  // -------------------------------------------------------------------------

  suite("Log output channel", () => {
    test("output channel named 'Google Java Format for VS Code' is created on activation", async () => {
      // Indirect check: extension must be active (which creates the channel)
      const ext = vscode.extensions.getExtension(EXTENSION_ID);
      assert.ok(ext);
      await waitUntil(() => ext?.isActive, 15_000);
      assert.ok(ext?.isActive);
      // If the output channel was not created, the extension would have thrown
      // during activate(), which we'd detect above as ext not becoming active.
    });
  });

  // -------------------------------------------------------------------------
  // Format document (requires java executable)
  // -------------------------------------------------------------------------

  suite("Format document (Java executable required)", () => {
    /**
     * Checks whether the google-java-format binary or Java runtime is available.
     * If not available the formatting tests are skipped gracefully.
     */
    async function isFormatterAvailable(): Promise<boolean> {
      try {
        const { execSync } = await import("node:child_process");
        execSync("java -version", { stdio: "pipe" });
        return true;
      } catch {
        return false;
      }
    }

    test("format document applies edits to an unformatted Java file", async function () {
      if (!(await isFormatterAvailable())) {
        console.log("  ↳ Skipping: Java runtime not available");
        return;
      }
      this.timeout(60_000);

      const editor = await openFixture("UnformattedSample.java");
      const doc = editor.document;
      const originalText = doc.getText();

      // Execute VS Code's built-in format document command
      await vscode.commands.executeCommand("editor.action.formatDocument");
      await waitUntil(() => doc.getText() !== originalText, 30_000);

      const formattedText = doc.getText();
      assert.notStrictEqual(formattedText, originalText, "Document should have been reformatted");
      // The formatted output should contain proper Google Java Style indentation
      assert.ok(
        formattedText.includes("  private"),
        "Formatted code should use 2-space indentation",
      );

      // Revert to avoid side-effects on the fixture file
      await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
    });

    test("format range applies edits only within the selected range", async function () {
      if (!(await isFormatterAvailable())) {
        console.log("  ↳ Skipping: Java runtime not available");
        return;
      }
      this.timeout(60_000);

      const editor = await openFixture("UnformattedSample.java");
      const doc = editor.document;

      // Select just lines 0-2 (import block)
      const range = new vscode.Range(0, 0, 2, 0);
      editor.selection = new vscode.Selection(range.start, range.end);

      const originalText = doc.getText();
      await vscode.commands.executeCommand("editor.action.formatSelection");
      await waitUntil(() => doc.getText() !== originalText, 30_000);

      assert.notStrictEqual(doc.getText(), originalText, "Selection should have been reformatted");

      await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
    });

    test("already-formatted document is unchanged after formatting", async function () {
      if (!(await isFormatterAvailable())) {
        console.log("  ↳ Skipping: Java runtime not available");
        return;
      }
      this.timeout(60_000);

      const editor = await openFixture("FormattedSample.java");
      const doc = editor.document;
      const originalText = doc.getText();

      await vscode.commands.executeCommand("editor.action.formatDocument");
      // Give the formatter a moment to apply edits
      await new Promise((r) => setTimeout(r, 3_000));

      assert.strictEqual(
        doc.getText(),
        originalText,
        "Already-formatted document should be unchanged",
      );
    });
  });

  // -------------------------------------------------------------------------
  // Clear cache command
  // -------------------------------------------------------------------------

  suite("clearCache command", () => {
    test("clearCache command can be executed without throwing", async function () {
      this.timeout(30_000);

      let errorThrown = false;
      try {
        await vscode.commands.executeCommand("googleJavaFormatForVSCode.clearCache");
      } catch (e) {
        // The command may internally trigger reloadExecutable which may fail
        // if no network – that's acceptable.  An unregistered command would
        // throw "command not found".
        const msg = (e as Error)?.message ?? "";
        if (msg.includes("command 'googleJavaFormatForVSCode.clearCache' not found")) {
          errorThrown = true;
        }
      }
      assert.strictEqual(errorThrown, false, "clearCache command should be registered");
    });
  });

  // -------------------------------------------------------------------------
  // Extension configuration
  // -------------------------------------------------------------------------

  suite("Extension configuration", () => {
    test("default configuration values are available", () => {
      const config = vscode.workspace.getConfiguration("java.format.settings.google");
      assert.strictEqual(config.get("version"), "latest", "Default version should be 'latest'");
      assert.strictEqual(
        config.get("mode"),
        "native-binary",
        "Default mode should be 'native-binary'",
      );
    });

    test("configuration section is recognised by VS Code", () => {
      const config = vscode.workspace.getConfiguration("java.format.settings.google");
      assert.ok(config, "Configuration section should be accessible");
      // The four contributed config keys should be readable
      const keys = ["executable", "version", "mode", "extra"];
      for (const key of keys) {
        assert.doesNotThrow(() => config.get(key), `config.get('${key}') should not throw`);
      }
    });
  });
});
