import { createFormatter } from "./gjf-wasm-client.js";

const els = Object.fromEntries(
  ["status", "log", "input", "output", "format", "selftest", "style"].map((id) => [
    id,
    document.getElementById(id),
  ]),
);
const status = (text, kind = "") => {
  els.status.textContent = text;
  els.status.className = "status " + kind;
};
const log = (text) => (els.log.textContent += text + "\n");

let selfTest = null;
const formatter = createFormatter();

try {
  const response = await fetch(new URL("selftest.json", import.meta.url));
  if (response.ok) {
    selfTest = await response.json();
    els.input.value = selfTest.cases[0].input;
  }
} catch (error) {
  log("no self-test fixtures: " + error);
}

const started = performance.now();
try {
  await formatter.ready;
  status(`Ready in ${Math.round(performance.now() - started)} ms`, "ok");
  els.format.disabled = false;
  els.selftest.disabled = !selfTest;
} catch (error) {
  status(String(error.message ?? error), "error");
}

els.format.addEventListener("click", async () => {
  els.format.disabled = true;
  const t0 = performance.now();
  status("Formatting…");
  try {
    els.output.value = await formatter.format(els.input.value, undefined, undefined, {
      style: els.style.value,
    });
    status(`Formatted in ${Math.round(performance.now() - t0)} ms`, "ok");
  } catch (error) {
    els.output.value = "";
    status(String(error.message ?? error), "error");
  } finally {
    els.format.disabled = false;
  }
});

els.selftest.addEventListener("click", async () => {
  els.selftest.disabled = true;
  let failures = 0;
  for (const testCase of selfTest.cases) {
    const t0 = performance.now();
    let actual;
    try {
      actual = await formatter.format(testCase.input);
    } catch (error) {
      actual = "ERROR: " + (error.message ?? error);
    }
    const elapsed = Math.round(performance.now() - t0);
    if (actual === testCase.expected) {
      log(`PASS ${testCase.name} (${elapsed} ms)`);
    } else {
      failures++;
      log(`FAIL ${testCase.name} (${elapsed} ms)`);
      log("  expected " + JSON.stringify(testCase.expected.slice(0, 100)));
      log("  actual   " + JSON.stringify(actual.slice(0, 100)));
    }
  }
  status(
    failures === 0
      ? `Self-test passed: ${selfTest.cases.length} file(s) match the reference output`
      : `Self-test failed: ${failures} of ${selfTest.cases.length} differ`,
    failures === 0 ? "ok" : "error",
  );
  els.selftest.disabled = false;
});
