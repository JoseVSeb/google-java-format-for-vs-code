// Demo page. Formatting runs in a Web Worker by default, which is the arrangement a
// VS Code for the Web extension would need, since its extension host is itself a worker.
// The main-thread backend is selectable for comparison and as a fallback.

const els = {
  status: document.getElementById("status"),
  log: document.getElementById("log"),
  input: document.getElementById("input"),
  output: document.getElementById("output"),
  format: document.getElementById("format"),
  selftest: document.getElementById("selftest"),
  backend: document.getElementById("backend"),
  javaVersion: document.getElementById("javaVersion"),
  style: document.getElementById("style"),
  fixImports: document.getElementById("fixImports"),
  formatJavadoc: document.getElementById("formatJavadoc"),
  reorderModifiers: document.getElementById("reorderModifiers"),
  reflowLongStrings: document.getElementById("reflowLongStrings"),
};

const params = new URLSearchParams(location.search);
// ?backend=main and ?java=11 make the page's configuration addressable, which the
// browser tests rely on and which is handy when comparing runtimes by hand.
if (params.has("backend")) {
  els.backend.value = params.get("backend");
}
if (params.has("java")) {
  els.javaVersion.value = params.get("java");
}
let formatter = null;
let selfTest = null;

function log(message) {
  els.log.textContent += message + "\n";
}

function status(message, kind = "") {
  els.status.textContent = message;
  els.status.className = "status " + kind;
}

function options() {
  return {
    style: els.style.value,
    fixImports: els.fixImports.checked,
    formatJavadoc: els.formatJavadoc.checked,
    reorderModifiers: els.reorderModifiers.checked,
    reflowLongStrings: els.reflowLongStrings.checked,
  };
}

async function boot() {
  const backend = els.backend.value;
  const javaVersion = els.javaVersion.value;
  els.format.disabled = true;
  els.selftest.disabled = true;

  const module =
    backend === "worker" ? await import("./gjf-client.js") : await import("./gjf-main-thread.js");

  formatter?.dispose();
  const started = performance.now();
  status(`Starting CheerpJ (${backend}, Java ${javaVersion})…`);

  formatter = module.createFormatter({
    jarUrl: "../dist/gjf-cheerpj.jar",
    javaVersion,
    // ?loader= lets the page point at a self-hosted runtime instead of the CDN.
    loaderUrl: params.get("loader") ?? undefined,
  });

  try {
    await formatter.ready;
    const version = await formatter.version();
    log(`${backend} backend ready in ${Math.round(performance.now() - started)} ms`);
    status(`Ready — google-java-format ${version} on CheerpJ's Java ${javaVersion} runtime`, "ok");
    els.format.disabled = false;
    els.selftest.disabled = !selfTest;
  } catch (error) {
    status(String(error.message ?? error), "error");
    log(String(error.stack ?? error));
  }
}

els.format.addEventListener("click", async () => {
  els.format.disabled = true;
  const started = performance.now();
  status("Formatting…");
  try {
    els.output.value = await formatter.format(els.input.value, undefined, undefined, options());
    status(`Formatted in ${Math.round(performance.now() - started)} ms`, "ok");
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
    let actual;
    try {
      // The fixtures were generated with the driver's defaults, so ignore the checkboxes here.
      actual = await formatter.format(testCase.input);
    } catch (error) {
      actual = "ERROR: " + (error.message ?? error);
    }
    if (actual === testCase.expected) {
      log(`PASS ${testCase.name}`);
    } else {
      failures++;
      log(`FAIL ${testCase.name}`);
      log("  expected " + JSON.stringify(testCase.expected.slice(0, 120)));
      log("  actual   " + JSON.stringify(actual.slice(0, 120)));
    }
  }
  const total = selfTest.cases.length;
  status(
    failures === 0
      ? `Self-test passed: ${total} file(s) match the reference output byte for byte`
      : `Self-test failed: ${failures} of ${total} file(s) differ, see the log`,
    failures === 0 ? "ok" : "error",
  );
  els.selftest.disabled = false;
});

for (const control of [els.backend, els.javaVersion]) {
  control.addEventListener("change", boot);
}

// Fixtures come from build.sh, formatted by a desktop JVM from this same jar. A mismatch
// therefore means CheerpJ's JVM disagreed with a stock one.
try {
  const response = await fetch(new URL("selftest.json", import.meta.url));
  if (response.ok) {
    selfTest = await response.json();
    els.input.value = selfTest.cases[0].input;
    log(`self-test fixtures: ${selfTest.cases.map((c) => c.name).join(", ")}`);
  }
} catch (error) {
  log("no self-test fixtures: " + error);
}

boot();
