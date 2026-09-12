// Runs the WebAssembly image inside a Web Worker.
//
// Web Image's JavaScript wrapper is written to be loaded as a script that immediately runs
// the Java main with the host's command line arguments, and it keeps its GraalVM object
// inside its own closure. There is no module export to import, and --shared does not add
// one in 25.0.4. So the wrapper is fetched as text and its last line, the bootstrap call, is
// replaced with one that publishes an awaitable entry point instead. Everything else about
// the file is untouched.
//
// Standard output arrives through console.log, so it is captured for the duration of a run.
// Each call boots a fresh VM: the wrapper instantiates the module per run, and nothing in it
// offers a way to re-enter main.

const BOOTSTRAP = "GraalVM.run(load_cmd_args(),config).catch(console.error);";
// The wrapper defaults its module path to its own script URL plus ".wasm". Evaluating it
// here would make that the worker's URL, so the path is set explicitly instead.
const REPLACEMENT =
  "globalThis.__runImage = (args) => {" +
  "  const c = new GraalVM.Config();" +
  "  c.wasm_path = globalThis.__wasmPath;" +
  "  return GraalVM.run(args, c);" +
  "};";

let runImage = null;
let wasmUrl = null;

// The wrapper captures console.log by reference when it loads (var stdoutWriter =
// new ConsoleWriter(console.log)), so a later override would never be seen. A stable
// forwarder is installed before evaluating it, and each run swaps the sink behind it.
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
      await load(options.imageUrl);
      return { ready: true };
    case "format":
      return await format(source, options ?? {});
    default:
      throw new Error(`unknown request type: ${type}`);
  }
}

async function load(imageUrl) {
  if (runImage) {
    return;
  }
  wasmUrl = new URL(imageUrl, self.location.href);
  const response = await fetch(wasmUrl);
  if (!response.ok) {
    throw new Error(`could not fetch ${wasmUrl}: ${response.status}`);
  }
  const wrapper = await response.text();
  if (!wrapper.includes(BOOTSTRAP)) {
    throw new Error(
      "the Web Image wrapper does not end with the expected bootstrap line; " +
        "a newer GraalVM may expose a real module export, in which case use that instead",
    );
  }
  globalThis.__wasmPath = wasmUrl.href + ".wasm";
  (0, eval)(wrapper.replace(BOOTSTRAP, REPLACEMENT));
  runImage = globalThis.__runImage;
  if (typeof runImage !== "function") {
    throw new Error("patching the wrapper did not produce an entry point");
  }
}

async function format(source, options) {
  if (!runImage) {
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
  const chunks = collected.out;
  // ConsoleWriter emits one console.log per line and drops the trailing newline.
  return chunks.join("\n") + "\n";
}
