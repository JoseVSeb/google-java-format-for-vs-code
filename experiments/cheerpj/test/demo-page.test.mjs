// Drives the demo page itself in a browser, with the stand-in loader, to check that both
// backends boot through the page's own wiring and that a missing runtime is reported rather
// than left hanging.

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = loadPlaywright();
const ORIGIN = process.env.TEST_ORIGIN ?? "http://localhost:8123";

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
let failures = 0;

async function check(name, url, expect) {
  const page = await browser.newPage();
  await page.goto(url);
  await page.waitForFunction(
    () => !document.getElementById("status").textContent.includes("Starting CheerpJ"),
    { timeout: 30000 },
  );
  const status = await page.textContent("#status");
  if (expect.test(status)) {
    console.log(`PASS ${name}`);
  } else {
    failures++;
    console.log(`FAIL ${name}\n  status: ${status}`);
  }
  await page.close();
}

const mock = encodeURIComponent("/web/test/mock-cheerpj.js");
await check("worker backend boots", `${ORIGIN}/web/?loader=${mock}`, /Ready — google-java-format mock/);
await check(
  "main-thread backend boots",
  `${ORIGIN}/web/?loader=${mock}&backend=main`,
  /Ready — google-java-format mock/,
);
await check(
  "unreachable runtime is reported",
  `${ORIGIN}/web/?loader=%2Fweb%2Ftest%2Fdoes-not-exist.js`,
  /could not load the CheerpJ runtime/,
);

await browser.close();
console.log(`\n${3 - failures} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
