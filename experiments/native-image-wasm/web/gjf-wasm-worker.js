// Runs the WebAssembly image inside a Web Worker.
//
// Web Image's JavaScript wrapper is written to be loaded as a script that immediately runs the
// Java main with the host's command line arguments, and it keeps its GraalVM object inside its
// own closure. There is no module export to import, and --shared does not add one in 25.0.4. So
// the wrapper is fetched as text, its bootstrap line is replaced with one that publishes the
// pieces needed to drive it, and the result is loaded from a blob URL.
//
// What is and is not reusable, both measured (see ../README.md):
//
//   * The compiled module IS reusable. The wrapper otherwise calls WebAssembly.instantiate on
//     raw bytes every run, which recompiles all 14.6 MB. Compiling once at startup and
//     instantiating per call roughly halves the per-call cost.
//   * The booted isolate is NOT reusable. Calling main a second time on a live instance fails
//     with "Fatal error: overwriting existing java.lang.Thread": the image's entry point
//     initialises thread state it will not initialise twice. Keeping a warm VM needs an
//     exported re-entrant function, which is what @JS.Export is for once Web Image surfaces a
//     usable export mechanism.
//
// Standard output arrives through console.log, captured by reference when the wrapper loads, so
// a forwarder is installed before it is loaded and the sink swapped per run.

const BOOTSTRAP = "GraalVM.run(load_cmd_args(),config).catch(console.error);";
const CONFIG_ANCHOR = "GraalVM.Config = Config;";
// Exposes the wrapper's own internals so a cached module can be instantiated per call, instead
// of letting it fetch and recompile the bytes every time.
const INTERNALS =
  CONFIG_ANCHOR +
  " GraalVM.__internals = {" +
  "  get runtime() { return runtime; }," +
  "  get imports() { return wasmImports; }," +
  "  Data, createVM" +
  " };";

let wrapper = null;
let compiled = null;
let wasmUrl = null;
let cacheModule = true;

let sink = null;
const realLog = console.log.bind(console);
const realError = console.error.bind(console);
console.log = (...parts) => (sink ? sink.out.push(parts.join(" ")) : realLog(...parts));
console.error = (...parts) => (sink ? sink.err.push(parts.join(" ")) : realError(...parts));

self.onmessage = async (event) => {
  const { id, type, source, options } = event.data;
  try {
    self.postMessage({ id, ok: true, result: await handle(type, source, options) });
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error && error.message ? error.message : error) });
  }
};

async function handle(type, source, options) {
  switch (type) {
    case "init":
      return await load(options.imageUrl, options);
    case "format":
      return await format(source, options ?? {});
    default:
      throw new Error(`unknown request type: ${type}`);
  }
}

async function load(imageUrl, options = {}) {
  cacheModule = options.cacheModule !== false;
  if (wrapper) {
    return { ready: true };
  }
  wasmUrl = new URL(imageUrl, self.location.href);
  const response = await fetch(wasmUrl);
  if (!response.ok) {
    throw new Error(`could not fetch ${wasmUrl}: ${response.status}`);
  }
  const text = await response.text();
  if (!text.includes(BOOTSTRAP) || !text.includes(CONFIG_ANCHOR)) {
    throw new Error(
      "the Web Image wrapper does not have the expected shape; a newer GraalVM may expose a " +
        "real module export, in which case use that instead of patching",
    );
  }

  const patched = text
    .replace(CONFIG_ANCHOR, INTERNALS)
    .replace(BOOTSTRAP, "globalThis.__graalVM = GraalVM;");
  // A blob URL rather than eval: a content security policy that forbids 'unsafe-eval' still
  // allows importScripts of a blob when blob: is among the worker's script sources.
  const blob = new Blob([patched], { type: "text/javascript" });
  const blobUrl = URL.createObjectURL(blob);
  try {
    importScripts(blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }

  wrapper = globalThis.__graalVM;
  if (!wrapper || typeof wrapper.run !== "function") {
    throw new Error("patching the wrapper did not produce an entry point");
  }

  if (!cacheModule) {
    return { ready: true, compiled: false };
  }
  // Compile once. This is the expensive half of a call and the half that can be shared.
  const bytes = await (await fetch(wasmUrl.href + ".wasm")).arrayBuffer();
  compiled = await WebAssembly.compile(bytes);
  return { ready: true, compiled: true };
}

async function runImage(args) {
  const internals = wrapper.__internals;
  if (!internals || !compiled) {
    // Fall back to the wrapper's own path, which refetches and recompiles per call.
    const config = new wrapper.Config();
    config.wasm_path = wasmUrl.href + ".wasm";
    await wrapper.run(args, config);
    return;
  }
  const config = new wrapper.Config();
  config.wasm_path = wasmUrl.href + ".wasm";
  const instance = await WebAssembly.instantiate(compiled, internals.imports);
  const data = new internals.Data(config);
  data.wasm = { instance, memory: instance.exports.memory };
  internals.createVM(args, data);
}

async function format(source, options) {
  if (!wrapper) {
    throw new Error("worker used before init");
  }
  const args = [];
  if (options.style === "AOSP") {
    args.push("--aosp");
  }
  if (options.fixImports === false) {
    args.push("--skip-sorting-imports");
  }
  if (options.formatJavadoc === false) {
    args.push("--skip-javadoc-formatting");
  }
  if (options.reflowLongStrings === false) {
    args.push("--skip-reflowing-long-strings");
  }
  if (options.startLine && options.endLine) {
    args.push("--lines", `${options.startLine}:${options.endLine}`);
  }
  args.push("--code", source);

  const collected = { out: [], err: [] };
  sink = collected;
  try {
    await runImage(args);
  } finally {
    sink = null;
  }
  if (collected.err.length > 0) {
    throw new Error(collected.err.join("\n"));
  }
  // ConsoleWriter emits one console.log per line and drops the trailing newline.
  return collected.out.join("\n") + "\n";
}
