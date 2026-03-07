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

    // Download VS Code, unzip it, and run the integration tests.
    // When VSCODE_TEST_COVERAGE=1 the test-electron runner collects V8 coverage
    // for the extension source and writes an lcov report to ./coverage/lcov.info.
    await runTests({ extensionDevelopmentPath, extensionTestsPath });
  } catch (err) {
    console.error("Failed to run tests", err);
    process.exit(1);
  }
}

main();
