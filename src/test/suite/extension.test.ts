import * as assert from "node:assert";
import * as path from "node:path";
import * as vscode from "vscode";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EXTENSION_ID = "josevseb.google-java-format-for-vs-code";
const FIXTURES_DIR = path.resolve(__dirname, "..", "..", "test", "fixtures");
const CONFIG = "java.format.settings.google";
const GLOBAL = vscode.ConfigurationTarget.Global;

/** Convenience accessor for the extension configuration section. */
function cfg() {
  return vscode.workspace.getConfiguration(CONFIG);
}

/** Reset all extension settings to their shipped defaults. */
async function resetConfig(): Promise<void> {
  await cfg().update("executable", undefined, GLOBAL);
  await cfg().update("version", "latest", GLOBAL);
  await cfg().update("mode", "native-binary", GLOBAL);
  await cfg().update("extra", undefined, GLOBAL);
}

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

/** Returns true when a Java runtime is on PATH (required for jar-file mode). */
async function isJavaAvailable(): Promise<boolean> {
  try {
    const { execSync } = await import("node:child_process");
    execSync("java -version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns true when Java 21+ is available on PATH.
 *
 * GJF ≥ 1.22.0 uses Java 21 compiler APIs (JCTree$JCAnyPattern etc.) and
 * refuses to start on older JVMs.  Jar-file-mode tests are skipped when Java
 * is absent or older than 21 so they fail fast rather than timing out.
 */
async function isJava21Available(): Promise<boolean> {
  if (!(await isJavaAvailable())) return false;
  try {
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync("java", ["-version"], { encoding: "utf8" });
    // `java -version` writes to stderr on most JVMs
    const output = (result.stderr ?? "") + (result.stdout ?? "");
    const match = output.match(/version "(\d+)/);
    return match ? Number.parseInt(match[1]) >= 21 : false;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Format-suite factory
//
// Each call to addFormatSuite() registers a Mocha sub-suite that exercises
// the full format pipeline for ONE specific extension configuration.
//
// Two configuration approaches are supported (matching the two documented
// ways to configure the extension):
//
//   1. `executable` override  – set `java.format.settings.google.executable`
//      to a pre-downloaded local file path.  `version` and `mode` are ignored
//      by the extension in this case.  Use when you already have the binary
//      and want to bypass the auto-download logic.
//
//   2. `version` + `mode` auto-download  – the extension calls the GitHub
//      Releases API, resolves the download URL for the requested version and
//      artifact type, downloads the file into its local cache, and runs it.
//      This is the normal (recommended) code path.
//
// The `extra` CLI-argument config setting is orthogonal – it applies to both
// approaches, so it does not appear in this scenario matrix.
// ---------------------------------------------------------------------------

interface FormatScenario {
  /**
   * Name of the environment variable whose value is the path to a
   * pre-downloaded local executable.  When set, this scenario tests the
   * `executable` override code path (approach 1 above).
   * If the env var is absent the tests in this suite are skipped gracefully.
   */
  executableEnvVar?: string;

  /**
   * GJF version to configure (approach 2).  Use `"latest"` or a concrete
   * semver string like `"1.25.2"`.
   */
  version?: string;

  /**
   * Artifact type to configure (approach 2): `"jar-file"` or
   * `"native-binary"`.  When `"jar-file"`, the extension downloads and runs
   * the all-deps jar; Java 21+ must be on PATH.  When `"native-binary"`,
   * the extension downloads the GraalVM native image for the current
   * platform and runs it directly (no JVM required); on platforms without a
   * native image the extension falls back to the jar.
   */
  mode?: "jar-file" | "native-binary";

  /** Set to true when this scenario's artifact requires Java 21+ on PATH. */
  requiresJava?: boolean;

  /**
   * Extra CLI arguments to pass to GJF (e.g. `"--aosp"`).
   * Maps directly to `java.format.settings.google.extra`.
   */
  extra?: string;

  /**
   * Name of the already-formatted fixture file used by the
   * "already-formatted document is unchanged" test.
   * Defaults to `"FormattedSample.java"`.
   */
  formattedFixture?: string;

  /**
   * Substring that must appear in the formatted output of
   * `UnformattedSample.java`, used to verify the expected indentation style.
   * Defaults to `"  private"` (2-space Google Style indentation).
   * Use `"    private"` for AOSP (4-space) scenarios.
   */
  indentCheck?: string;
}

function addFormatSuite(suiteName: string, scenario: FormatScenario) {
  suite(suiteName, () => {
    // -----------------------------------------------------------------------
    // Setup: configure the extension for this scenario and let it (re)load
    // the appropriate executable.  When the scenario uses version+mode, the
    // extension calls the GitHub Releases API and downloads the binary into
    // its local cache – allow up to 2 minutes for this step.
    // -----------------------------------------------------------------------
    suiteSetup(async function (this: Mocha.Context) {
      this.timeout(120_000);

      if (scenario.executableEnvVar) {
        // Approach 1: explicit executable path
        const execPath = process.env[scenario.executableEnvVar];
        if (!execPath) return; // tests in this suite will skip via isAvailable()
        await cfg().update("executable", execPath, GLOBAL);
        // version/mode are ignored when executable is set, but clear them for
        // clarity so the VS Code settings inspector looks clean.
        await cfg().update("version", undefined, GLOBAL);
        await cfg().update("mode", undefined, GLOBAL);
      } else {
        // Approach 2: version + mode auto-download
        await cfg().update("executable", undefined, GLOBAL); // must be clear
        if (scenario.version !== undefined) {
          await cfg().update("version", scenario.version, GLOBAL);
        }
        if (scenario.mode !== undefined) {
          await cfg().update("mode", scenario.mode, GLOBAL);
        }
      }

      // Apply the extra CLI args setting (e.g. "--aosp") when provided.
      await cfg().update("extra", scenario.extra ?? undefined, GLOBAL);

      // Explicitly reload so the extension picks up the new settings without
      // waiting for the user-facing "Update?" notification dialog.
      // For version+mode scenarios this triggers the GitHub API call +
      // binary download on a cache miss.
      await vscode.commands.executeCommand("googleJavaFormatForVSCode.reloadExecutable");
    });

    suiteTeardown(async () => {
      // Reset all settings to defaults so the next suite/scenario starts clean.
      await cfg().update("executable", undefined, GLOBAL);
      await cfg().update("version", "latest", GLOBAL);
      await cfg().update("mode", "native-binary", GLOBAL);
      await cfg().update("extra", undefined, GLOBAL);
    });

    /** True when the prerequisite for this scenario is met. */
    async function isAvailable(): Promise<boolean> {
      if (scenario.executableEnvVar && !process.env[scenario.executableEnvVar]) return false;
      if (scenario.requiresJava && !(await isJava21Available())) return false;
      return true;
    }

    const skipMsg = scenario.executableEnvVar
      ? `  ↳ Skipping: ${scenario.executableEnvVar} env var not set`
      : scenario.requiresJava
        ? "  ↳ Skipping: Java 21+ not available on PATH (GJF ≥ 1.22.0 requires Java 21)"
        : null;

    // Resolved per-scenario settings used in test assertions.
    const formattedFixture = scenario.formattedFixture ?? "FormattedSample.java";
    const indentCheck = scenario.indentCheck ?? "  private";

    // -----------------------------------------------------------------------
    // Tests (identical for every scenario; what differs is how the executable
    // was obtained and which code path in the extension exercised)
    // -----------------------------------------------------------------------

    test("format document applies edits to an unformatted Java file", async function () {
      if (!(await isAvailable())) {
        console.log(skipMsg ?? "  ↳ Skipping");
        return;
      }
      this.timeout(60_000);

      const editor = await openFixture("UnformattedSample.java");
      const doc = editor.document;
      const originalText = doc.getText();

      await vscode.commands.executeCommand("editor.action.formatDocument");
      await waitUntil(() => doc.getText() !== originalText, 30_000);

      const formattedText = doc.getText();
      assert.notStrictEqual(formattedText, originalText, "Document should have been reformatted");
      assert.ok(
        formattedText.includes(indentCheck),
        `Formatted code should contain "${indentCheck}" (expected indentation style)`,
      );

      await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
    });

    test("format range applies edits only within the selected range", async function () {
      if (!(await isAvailable())) {
        console.log(skipMsg ?? "  ↳ Skipping");
        return;
      }
      this.timeout(60_000);

      const editor = await openFixture("UnformattedSample.java");
      const doc = editor.document;

      // Select lines 0-4 (position 0 of line 5 is the exclusive end) so that
      // the selection covers the class declaration which contains unformatted
      // code regardless of whether GJF removes unused imports.
      const range = new vscode.Range(0, 0, 5, 0);
      editor.selection = new vscode.Selection(range.start, range.end);

      const originalText = doc.getText();
      await vscode.commands.executeCommand("editor.action.formatSelection");
      await waitUntil(() => doc.getText() !== originalText, 30_000);

      assert.notStrictEqual(doc.getText(), originalText, "Selection should have been reformatted");

      await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
    });

    test("already-formatted document is unchanged after formatting", async function () {
      if (!(await isAvailable())) {
        console.log(skipMsg ?? "  ↳ Skipping");
        return;
      }
      this.timeout(60_000);

      const editor = await openFixture(formattedFixture);
      const doc = editor.document;
      const originalText = doc.getText();

      await vscode.commands.executeCommand("editor.action.formatDocument");
      // Give the formatter a moment to (not) apply edits
      await new Promise((r) => setTimeout(r, 3_000));

      assert.strictEqual(
        doc.getText(),
        originalText,
        "Already-formatted document should be unchanged",
      );
    });

    test("format an in-memory (untitled) Java document", async function () {
      if (!(await isAvailable())) {
        console.log(skipMsg ?? "  ↳ Skipping");
        return;
      }
      this.timeout(60_000);

      // Create an untitled in-memory document (not backed by a file on disk).
      // This exercises the formatting provider against a document that has no
      // file URI, which is a distinct code path from opening a fixture file.
      const unformattedContent = [
        "public class InlineTest{",
        "private int x;",
        "public int getX(){return x;}",
        "}",
      ].join("\n");

      const doc = await vscode.workspace.openTextDocument({
        language: "java",
        content: unformattedContent,
      });
      await vscode.window.showTextDocument(doc);

      await vscode.commands.executeCommand("editor.action.formatDocument");
      await waitUntil(() => doc.getText() !== unformattedContent, 30_000);

      const formattedText = doc.getText();
      assert.notStrictEqual(
        formattedText,
        unformattedContent,
        "In-memory document should have been reformatted",
      );
      assert.ok(
        formattedText.includes(indentCheck),
        `In-memory document should contain "${indentCheck}" after formatting`,
      );

      // Close without saving – untitled docs have no on-disk state to revert.
      await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
    });
  });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

suite("Google Java Format for VS Code – e2e", () => {
  // -------------------------------------------------------------------------
  // Global teardown: ensure no test-specific settings linger after the run.
  // Each format-scenario suite manages its own setup/teardown, so the global
  // teardown only needs to do a final reset.
  // -------------------------------------------------------------------------
  suiteTeardown(async () => {
    await resetConfig();
  });

  // -------------------------------------------------------------------------
  // Extension activation
  //
  // Without any pre-configured executable, the extension activates with the
  // default settings (version=latest, mode=native-binary).  On first
  // activation it calls the GitHub Releases API and downloads the native
  // binary into the local cache.  Allow up to 90 s (test timeout) to
  // accommodate this.
  // -------------------------------------------------------------------------

  suite("Extension activation", () => {
    test("extension is present in the extension list", () => {
      const ext = vscode.extensions.getExtension(EXTENSION_ID);
      assert.ok(ext, `Extension ${EXTENSION_ID} not found`);
    });

    test("extension activates without errors", async function () {
      this.timeout(90_000);
      const ext = vscode.extensions.getExtension(EXTENSION_ID);
      assert.ok(ext, `Extension ${EXTENSION_ID} not found`);

      // Activation is triggered by opening a Java file
      const doc = await vscode.workspace.openTextDocument({
        language: "java",
        content: "public class Tmp {}",
      });
      await vscode.window.showTextDocument(doc);

      // Allow up to 60 s for waitUntil (test timeout is 90 s to include overhead).
      await waitUntil(() => ext.isActive, 60_000);
      assert.ok(ext.isActive, "Extension should be active after opening a Java document");
    });

    test("extension exports activate and deactivate functions", async () => {
      const ext = vscode.extensions.getExtension(EXTENSION_ID);
      assert.ok(ext);
      await ext?.activate();
      assert.ok(ext?.isActive, "Extension should still be active after explicit activate() call");
    });
  });

  // -------------------------------------------------------------------------
  // Command registration
  // -------------------------------------------------------------------------

  suite("Command registration", () => {
    suiteSetup(async () => {
      const ext = vscode.extensions.getExtension(EXTENSION_ID);
      if (ext && !ext.isActive) {
        const doc = await vscode.workspace.openTextDocument({
          language: "java",
          content: "public class Tmp {}",
        });
        await vscode.window.showTextDocument(doc);
        await waitUntil(() => ext.isActive, 60_000);
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
      const doc = await vscode.workspace.openTextDocument({
        language: "java",
        content: "public class A {}",
      });
      await vscode.window.showTextDocument(doc);

      let threw = false;
      try {
        await vscode.commands.executeCommand<vscode.TextEdit[]>(
          "vscode.executeFormatDocumentProvider",
          doc.uri,
        );
      } catch {
        threw = true;
      }
      assert.strictEqual(threw, false, "Format command should not throw at the provider level");
    });
  });

  // -------------------------------------------------------------------------
  // Log output channel
  // -------------------------------------------------------------------------

  suite("Log output channel", () => {
    test("output channel named 'Google Java Format for VS Code' is created on activation", async () => {
      const ext = vscode.extensions.getExtension(EXTENSION_ID);
      assert.ok(ext);
      await waitUntil(() => ext?.isActive, 60_000);
      assert.ok(ext?.isActive);
    });
  });

  // -------------------------------------------------------------------------
  // Format document – scenario matrix
  //
  // The extension can be pointed at GJF in two mutually-exclusive ways:
  //
  //   Approach 1 – executable override:
  //     Set `java.format.settings.google.executable` to a file path or URL.
  //     The extension uses that binary directly; `version` and `mode` are
  //     ignored.
  //
  //   Approach 2 – version + mode (recommended):
  //     Set `java.format.settings.google.version` (e.g. "latest" or "1.25.2")
  //     and `java.format.settings.google.mode` ("native-binary" or "jar-file").
  //     The extension calls the GitHub Releases API, resolves the download URL,
  //     downloads the binary to its local cache, and runs it.
  //
  // The `extra` setting is orthogonal – it applies to both approaches and is
  // exercised by scenarios F and G (AOSP 4-space style).
  //
  // The following scenarios exercise realistic configuration combinations:
  //
  //   A  executable=<local path>                        (approach 1)
  //   B  version=latest  + native-binary                (approach 2)
  //   C  version=latest  + jar-file                     (approach 2, Java 21+)
  //   D  version=1.25.2  + native-binary                (approach 2, specific)
  //   E  version=1.25.2  + jar-file                     (approach 2, specific, Java 21+)
  //   F  version=latest  + native-binary + extra=--aosp (approach 2, AOSP style)
  //   G  version=latest  + jar-file      + extra=--aosp (approach 2, AOSP + Java 21+)
  //
  // Scenario A is guarded by the GJF_EXECUTABLE env var set by the CI step
  // "Download GJF native binary (for executable scenario)".  Scenarios B–G
  // are always attempted; C, E and G are skipped gracefully when Java is absent.
  // Scenarios F and G reuse the binaries cached by B and C respectively, so
  // they incur no additional download latency.
  // -------------------------------------------------------------------------

  addFormatSuite("Scenario A – executable: local file path", {
    executableEnvVar: "GJF_EXECUTABLE",
  });

  addFormatSuite("Scenario B – version:latest, mode:native-binary (auto-download)", {
    version: "latest",
    mode: "native-binary",
  });

  addFormatSuite("Scenario C – version:latest, mode:jar-file (auto-download)", {
    version: "latest",
    mode: "jar-file",
    requiresJava: true,
  });

  addFormatSuite("Scenario D – version:1.25.2, mode:native-binary (auto-download)", {
    version: "1.25.2",
    mode: "native-binary",
  });

  addFormatSuite("Scenario E – version:1.25.2, mode:jar-file (auto-download)", {
    version: "1.25.2",
    mode: "jar-file",
    requiresJava: true,
  });

  addFormatSuite(
    "Scenario F – version:latest, mode:native-binary, extra:--aosp (AOSP style)",
    {
      version: "latest",
      mode: "native-binary",
      extra: "--aosp",
      // AOSP style uses 4-space indentation; use the AOSP-formatted fixture
      // for the "already-formatted" test and check for 4-space indent.
      formattedFixture: "AospFormattedSample.java",
      indentCheck: "    private",
    },
  );

  addFormatSuite("Scenario G – version:latest, mode:jar-file, extra:--aosp (AOSP style)", {
    version: "latest",
    mode: "jar-file",
    requiresJava: true,
    extra: "--aosp",
    formattedFixture: "AospFormattedSample.java",
    indentCheck: "    private",
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
      const config = vscode.workspace.getConfiguration(CONFIG);
      assert.strictEqual(config.get("version"), "latest", "Default version should be 'latest'");
      assert.strictEqual(
        config.get("mode"),
        "native-binary",
        "Default mode should be 'native-binary'",
      );
    });

    test("configuration section is recognised by VS Code", () => {
      const config = vscode.workspace.getConfiguration(CONFIG);
      assert.ok(config, "Configuration section should be accessible");
      const keys = ["executable", "version", "mode", "extra"];
      for (const key of keys) {
        assert.doesNotThrow(() => config.get(key), `config.get('${key}') should not throw`);
      }
    });

    test("extra CLI argument setting defaults to null", () => {
      const config = vscode.workspace.getConfiguration(CONFIG);
      assert.strictEqual(config.get("extra"), null, "Default extra should be null");
    });

    test("extra CLI argument setting can be updated and read back", async () => {
      await cfg().update("extra", "--aosp", GLOBAL);
      assert.strictEqual(cfg().get("extra"), "--aosp", "extra should reflect the updated value");
      await cfg().update("extra", undefined, GLOBAL);
      assert.strictEqual(
        cfg().get("extra"),
        null,
        "extra should revert to null after being cleared",
      );
    });
  });
});
