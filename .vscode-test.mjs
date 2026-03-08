import { defineConfig } from "@vscode/test-cli";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  files: "out/test/suite/**/*.test.js",
  version: "stable",
  launchArgs: [
    // Keep the user-data dir short to stay under the 103-char Unix socket limit
    // on macOS/Linux. The default path VS Code derives from the extension
    // development path can easily exceed 103 chars on CI, crashing VS Code.
    "--user-data-dir",
    path.join(os.tmpdir(), "vsc-u"),
  ],
  mocha: {
    timeout: 60_000,
  },
  coverage: {
    includeAll: true,
    include: ["dist/**/*.js"],
    exclude: ["node_modules/**"],
    reporter: ["html", "text"],
  },
});
