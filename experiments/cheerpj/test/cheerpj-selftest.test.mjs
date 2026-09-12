// The release gate: loads the demo page against the real CheerpJ runtime, runs the
// self-test in the browser, and fails if CheerpJ's JVM disagrees with a desktop one.
//
// The fixtures were formatted by a stock JVM from this same jar during the build, so this
// compares two JVMs on identical input. It needs network access to Leaning Technologies'
// CDN; where that is blocked the run fails saying so rather than passing silently.

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = loadPlaywright();
const ORIGIN = process.env.TEST_ORIGIN ?? "http://localhost:8123";
const JAVA_VERSION = process.env.CHEERPJ_JAVA_VERSION ?? "17";
const BACKEND = process.env.CHEERPJ_BACKEND ?? "worker";
const TIMEOUT = Number(process.env.CHEERPJ_TIMEOUT_MS ?? 300000);

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
page.on("console", (message) => {
  if (message.type() === "error") {
    console.log(`  [console] ${message.text()}`);
  }
});

let failed = false;
try {
  await page.goto(`${ORIGIN}/web/?backend=${BACKEND}&java=${JAVA_VERSION}`);

  console.log(`starting CheerpJ (${BACKEND} backend, Java ${JAVA_VERSION})…`);
  await page.waitForFunction(
    () => !document.getElementById("status").textContent.includes("Starting CheerpJ"),
    { timeout: TIMEOUT },
  );
  const booted = await page.textContent("#status");
  console.log(`  ${booted}`);
  if (!booted.startsWith("Ready")) {
    throw new Error(`CheerpJ did not start: ${booted}`);
  }

  await page.click("#selftest");
  await page.waitForFunction(
    () => document.getElementById("status").textContent.startsWith("Self-test"),
    { timeout: TIMEOUT },
  );
  const result = await page.textContent("#status");
  console.log(`  ${result}`);
  console.log((await page.textContent("#log")).trim());
  if (!result.startsWith("Self-test passed")) {
    throw new Error(result);
  }
  console.log("\nPASS the browser JVM matches the desktop JVM on every fixture");
} catch (error) {
  failed = true;
  console.log(`\nFAIL ${error.message}`);
} finally {
  await browser.close();
}

process.exit(failed ? 1 : 0);
