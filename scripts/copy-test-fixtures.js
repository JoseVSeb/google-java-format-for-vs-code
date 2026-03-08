// @ts-check
/**
 * This script is required because `tsc` does not copy non-TypeScript files to
 * the output directory. During test compilation, `.java` fixture files in
 * `src/test/fixtures/` must be available in `out/test/fixtures/` so VS Code's
 * test runner can open them as documents. This script is called by the
 * `compile-tests` npm script after `tsc` finishes.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const src = path.resolve(__dirname, "..", "src", "test", "fixtures");
const dest = path.resolve(__dirname, "..", "out", "test", "fixtures");

fs.cpSync(src, dest, { recursive: true });
