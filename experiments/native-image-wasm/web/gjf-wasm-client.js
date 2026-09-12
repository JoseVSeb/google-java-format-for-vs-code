// Page-side wrapper around the WebAssembly worker, matching the extension's own
// format(text, range?, signal?) interface.

export function createFormatter(config = {}) {
  const worker = new Worker(new URL("./gjf-wasm-worker.js", import.meta.url), { type: "classic" });
  const pending = new Map();
  let nextId = 1;

  worker.onmessage = (event) => {
    const { id, ok, result, error } = event.data;
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    ok ? entry.resolve(result) : entry.reject(new Error(error));
  };
  worker.onerror = (event) => {
    const failure = new Error(`wasm worker failed: ${event.message ?? "unknown error"}`);
    for (const entry of pending.values()) entry.reject(failure);
    pending.clear();
  };

  function send(request) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker.postMessage({ ...request, id });
    });
  }

  const ready = send({
    type: "init",
    options: {
      imageUrl: config.imageUrl ?? "../dist/gjf-wasm.js",
      // Off compiles the module inside every call, which is what the wrapper does alone.
      cacheModule: config.cacheModule !== false,
    },
  });

  return {
    ready,
    async format(text, range, signal, options = {}) {
      await ready;
      return send({
        type: "format",
        source: text,
        options: { ...options, startLine: range?.[0] ?? 0, endLine: range?.[1] ?? 0 },
      });
    },
    dispose() {
      worker.terminate();
    },
  };
}
