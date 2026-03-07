import * as os from "node:os";
import * as path from "node:path";
import { runTests } from "@vscode/test-electron";

async function main() {
  try {
    // The folder containing the Extension Manifest package.json.
    // Passed to --extensionDevelopmentPath.
    const extensionDevelopmentPath = path.resolve(__dirname, "../../");

    // The path to the test runner.
    // Passed to --extensionTestsPath.
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");

    // macOS (and Linux) enforce a 103-character limit on Unix domain socket
    // paths. The default VS Code test user-data directory is derived from the
    // extension development path, which can easily exceed that limit on CI
    // (e.g. /Users/runner/work/<repo>/<repo>/.vscode-test/user-data/…).
    // We use a short subdirectory inside the OS temp dir to avoid this.
    // The resulting socket path is ≤69 chars on macOS and ≤25 chars on Linux
    // — both well under the 103-char limit.
    const userDataDir = path.join(os.tmpdir(), "vsc-u");

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: ["--user-data-dir", userDataDir],
    });
  } catch (err) {
    console.error("Failed to run tests", err);
    process.exit(1);
  }
}

main();
