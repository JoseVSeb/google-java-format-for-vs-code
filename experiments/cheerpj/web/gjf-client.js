// Client side of the worker protocol.
//
// The returned object matches the extension's own IGoogleJavaFormatter shape,
// format(text, range?, signal?), so the browser backend can slot in behind the same
// interface the native binary sits behind today.

const DEFAULT_LOADER = "https://cjrtnc.leaningtech.com/4.3/loader.js";

/**
 * Starts a worker, boots CheerpJ inside it and resolves to a formatter.
 *
 * @param {object} config
 * @param {string|URL} config.jarUrl bundle location, same origin as the page
 * @param {string} [config.loaderUrl] CheerpJ loader; override to self-host the runtime
 * @param {string} [config.javaVersion] CheerpJ runtime to request, "8", "11" or "17"
 * @param {string|URL} [config.workerUrl] override for bundlers that rewrite worker paths
 */
export function createFormatter(config) {
  const jarUrl = new URL(config.jarUrl, location.href);
  const workerUrl = new URL(config.workerUrl ?? "./gjf-worker.js", import.meta.url);
  const worker = new Worker(workerUrl, { type: "classic" });

  const pending = new Map();
  let nextId = 1;
  let disposed = false;

  worker.onmessage = (event) => {
    const { id, ok, result, error } = event.data;
    const entry = pending.get(id);
    if (!entry) {
      return; // an abandoned request: the caller aborted and moved on
    }
    pending.delete(id);
    ok ? entry.resolve(result) : entry.reject(new Error(error));
  };

  worker.onerror = (event) => {
    const failure = new Error(`formatter worker failed: ${event.message ?? "unknown error"}`);
    for (const entry of pending.values()) {
      entry.reject(failure);
    }
    pending.clear();
  };

  function send(request, signal) {
    if (disposed) {
      return Promise.reject(new Error("formatter disposed"));
    }
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker.postMessage({ ...request, id });

      if (signal) {
        if (signal.aborted) {
          abort();
        } else {
          signal.addEventListener("abort", abort, { once: true });
        }
      }

      function abort() {
        // The JVM call cannot be interrupted, so the worker finishes it and the reply is
        // dropped. Cancellation is about the caller, not about saving the work.
        if (pending.delete(id)) {
          reject(new DOMException("formatting aborted", "AbortError"));
        }
      }
    });
  }

  // CheerpJ mounts the page's origin at /app, so the jar's virtual path is its pathname.
  const ready = send({
    type: "init",
    loaderUrl: config.loaderUrl ?? DEFAULT_LOADER,
    jarPath: "/app" + jarUrl.pathname,
    javaVersion: config.javaVersion ?? "17",
  });

  return {
    /** Resolves once CheerpJ has started and the bundle is loaded. */
    ready,

    /** The google-java-format release the bundle was built from. */
    async version() {
      await ready;
      return send({ type: "version" });
    },

    /**
     * @param {string} text source to format
     * @param {[number, number]} [range] 1-based inclusive line range, as VS Code passes it
     * @param {AbortSignal} [signal]
     * @param {object} [options] style and toggles, defaulting to the CLI's own defaults
     */
    async format(text, range, signal, options = {}) {
      await ready;
      return send(
        {
          type: "format",
          source: text,
          options: { ...options, startLine: range?.[0] ?? 0, endLine: range?.[1] ?? 0 },
        },
        signal,
      );
    },

    dispose() {
      disposed = true;
      worker.postMessage({ type: "dispose", id: 0 });
      worker.terminate();
      for (const entry of pending.values()) {
        entry.reject(new Error("formatter disposed"));
      }
      pending.clear();
    },
  };
}
