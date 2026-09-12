// Exercises the worker protocol in a real browser, with a stand-in for CheerpJ's loader.
//
// What this covers: the worker boots, options and line ranges reach the Java entry point in
// the right positions, results correlate by id under concurrency, formatter errors surface as
// rejections, aborts reject without breaking the worker, and a loader that cannot be fetched
// produces a message that says so. What it does not cover: the JVM itself.
//
// Usage: ./test.sh   (starts the static server, runs this)

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = loadPlaywright();
const ORIGIN = process.env.TEST_ORIGIN ?? "http://localhost:8123";
const HOST_PAGE = `${ORIGIN}/web/test/blank.html`;
const MOCK_LOADER = `${ORIGIN}/web/test/mock-cheerpj.js`;

function loadPlaywright() {
  for (const id of ["playwright", "/opt/node22/lib/node_modules/playwright"]) {
    try {
      return require(id);
    } catch {}
  }
  throw new Error("playwright is not installed: npm i -D playwright");
}

const tests = [];
const test = (name, body) => tests.push({ name, body });
function assertEqual(actual, expected, what) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${what}\n  expected ${e}\n  actual   ${a}`);
  }
}

// Each test runs in the page and returns plain data; the assertions live here in Node.
async function inPage(page, body, arg) {
  return page.evaluate(body, { mockLoader: MOCK_LOADER, ...arg });
}

test("boots and reports the version", async (page) => {
  const result = await inPage(page, async ({ mockLoader }) => {
    const { createFormatter } = await import("/web/gjf-client.js");
    const formatter = createFormatter({ jarUrl: "/dist/gjf-cheerpj.jar", loaderUrl: mockLoader });
    const version = await formatter.version();
    formatter.dispose();
    return version;
  });
  assertEqual(result, "mock-1.36.1", "version() should round-trip through the worker");
});

test("passes the jar path and java version to CheerpJ", async (page) => {
  const result = await inPage(page, async ({ mockLoader }) => {
    const { createFormatter } = await import("/web/gjf-client.js");
    const formatter = createFormatter({
      jarUrl: "/dist/gjf-cheerpj.jar",
      loaderUrl: mockLoader,
      javaVersion: "11",
    });
    await formatter.ready;
    const seen = await formatter.format("probe");
    formatter.dispose();
    return seen;
  });
  // The mock echoes style|flags|lines|source; defaults must match the CLI's defaults.
  assertEqual(result, "GOOGLE|1111|0:0|probe", "default options should match the CLI defaults");
});

test("maps a VS Code line range onto the formatter's 1-based lines", async (page) => {
  const result = await inPage(page, async ({ mockLoader }) => {
    const { createFormatter } = await import("/web/gjf-client.js");
    const formatter = createFormatter({ jarUrl: "/dist/gjf-cheerpj.jar", loaderUrl: mockLoader });
    const out = await formatter.format("src", [3, 9], undefined, { style: "AOSP", reflowLongStrings: false });
    formatter.dispose();
    return out;
  });
  assertEqual(result, "AOSP|1110|3:9|src", "range and option overrides should reach Java");
});

test("correlates concurrent requests", async (page) => {
  const result = await inPage(page, async ({ mockLoader }) => {
    const { createFormatter } = await import("/web/gjf-client.js");
    const formatter = createFormatter({ jarUrl: "/dist/gjf-cheerpj.jar", loaderUrl: mockLoader });
    const [slow, fast] = await Promise.all([formatter.format("SLOW-one"), formatter.format("two")]);
    formatter.dispose();
    return [slow, fast];
  });
  assertEqual(
    result,
    ["GOOGLE|1111|0:0|SLOW-one", "GOOGLE|1111|0:0|two"],
    "each caller should get its own reply",
  );
});

test("surfaces a formatter error as a rejection", async (page) => {
  const result = await inPage(page, async ({ mockLoader }) => {
    const { createFormatter } = await import("/web/gjf-client.js");
    const formatter = createFormatter({ jarUrl: "/dist/gjf-cheerpj.jar", loaderUrl: mockLoader });
    let message = "no rejection";
    try {
      await formatter.format("TRIGGER_ERROR");
    } catch (error) {
      message = error.message;
    }
    const stillWorks = await formatter.format("after");
    formatter.dispose();
    return [message, stillWorks];
  });
  assertEqual(
    result,
    ["3:7: error: mock parse failure", "GOOGLE|1111|0:0|after"],
    "a parse failure should reject that call only",
  );
});

test("aborts a pending request and keeps working", async (page) => {
  const result = await inPage(page, async ({ mockLoader }) => {
    const { createFormatter } = await import("/web/gjf-client.js");
    const formatter = createFormatter({ jarUrl: "/dist/gjf-cheerpj.jar", loaderUrl: mockLoader });
    await formatter.ready;
    const controller = new AbortController();
    const pending = formatter.format("SLOW-aborted", undefined, controller.signal);
    controller.abort();
    let name = "no rejection";
    try {
      await pending;
    } catch (error) {
      name = error.name;
    }
    const next = await formatter.format("next");
    formatter.dispose();
    return [name, next];
  });
  assertEqual(result, ["AbortError", "GOOGLE|1111|0:0|next"], "abort should reject only that call");
});

test("explains a CheerpJ runtime that cannot be fetched", async (page) => {
  const result = await inPage(page, async () => {
    const { createFormatter } = await import("/web/gjf-client.js");
    const formatter = createFormatter({
      jarUrl: "/dist/gjf-cheerpj.jar",
      loaderUrl: "/web/test/does-not-exist.js",
    });
    let message = "no rejection";
    try {
      await formatter.ready;
    } catch (error) {
      message = error.message;
    }
    formatter.dispose();
    return message.includes("could not load the CheerpJ runtime");
  });
  assertEqual(result, true, "an unreachable runtime should say so plainly");
});

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? undefined,
  args: ["--no-sandbox"],
});
let failures = 0;
for (const { name, body } of tests) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(HOST_PAGE);
  try {
    await body(page);
    if (errors.length > 0) {
      throw new Error(`page errors: ${errors.join("; ")}`);
    }
    console.log(`PASS ${name}`);
  } catch (error) {
    failures++;
    console.log(`FAIL ${name}\n  ${error.message}`);
  }
  await page.close();
}
await browser.close();

console.log(`\n${tests.length - failures} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
