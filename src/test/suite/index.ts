import * as path from "node:path";
import { glob } from "glob";
import * as Mocha from "mocha";

export async function run() {
  // Create the mocha test
  const mocha = new Mocha({
    ui: "tdd",
    color: true,
  });

  const testsRoot = path.resolve(__dirname, "..");

  // Get list of test files
  const files = await glob("**/**.test.js", { cwd: testsRoot });

  // Add files to the test suite
  for (const f of files) {
    mocha.addFile(path.resolve(testsRoot, f));
  }

  // Run the mocha test
  mocha.run((failures) => {
    if (failures > 0) {
      throw new Error(`${failures} tests failed.`);
    }
  });
}
