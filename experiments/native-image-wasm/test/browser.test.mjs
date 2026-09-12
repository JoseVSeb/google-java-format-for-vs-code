// Runs the WebAssembly image in a real browser and compares its output with the official
// jar's, formatted on a JVM at build time. Everything is served locally: unlike the CheerpJ
// route, no third-party runtime is fetched, so this can run offline.

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = loadPlaywright();
const ORIGIN = process.env.TEST_ORIGIN ?? "http://localhost:8124";
const TIMEOUT = Number(process.env.WASM_TIMEOUT_MS ?? 300000);

function loadPlaywright() {
  for (const id of ["playwright", "/opt/node22/lib/node_modules/playwright"]) {
    try {
      return require(id);
    } catch {}
  }
  throw new Error("playwright is not installed: npm i -D playwright");
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? undefined,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
page.on("console", (m) => m.type() === "error" && console.log(`  [console] ${m.text()}`));

let failed = false;
try {
  await page.goto(`${ORIGIN}/web/`);
  await page.waitForFunction(
    () => !document.getElementById("status").textContent.startsWith("Loading"),
    { timeout: TIMEOUT },
  );
  const booted = await page.textContent("#status");
  console.log(`  ${booted}`);
  if (!booted.startsWith("Ready")) throw new Error(booted);

  await page.click("#selftest");
  await page.waitForFunction(
    () => document.getElementById("status").textContent.startsWith("Self-test"),
    { timeout: TIMEOUT },
  );
  const result = await page.textContent("#status");
  console.log((await page.textContent("#log")).trim());
  console.log(`  ${result}`);
  if (!result.startsWith("Self-test passed")) throw new Error(result);
  console.log("\nPASS the WebAssembly image matches the official jar in a browser");
} catch (error) {
  failed = true;
  console.log(`\nFAIL ${error.message}`);
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
