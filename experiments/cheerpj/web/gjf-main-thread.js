// Main-thread backend, exposing the same interface as gjf-client.js.
//
// The worker backend is the one to prefer: formatting a large file blocks its thread for a
// noticeable time, and on the main thread that is the UI. This exists for hosts that forbid
// workers or forbid a worker fetching a remote script, where the fallback is to run CheerpJ
// on a page's own thread (in VS Code for the Web, that page would be a webview).

const DEFAULT_LOADER = "https://cjrtnc.leaningtech.com/4.3/loader.js";

export function createFormatter(config) {
  const jarUrl = new URL(config.jarUrl, location.href);
  const loaderUrl = config.loaderUrl ?? DEFAULT_LOADER;
  const javaVersion = config.javaVersion ?? "17";
  let disposed = false;

  const ready = (async () => {
    await loadScript(loaderUrl);
    if (typeof cheerpjInit !== "function") {
      throw new Error(`${loaderUrl} loaded but did not define cheerpjInit`);
    }
    await cheerpjInit({ javaVersion, status: "none" });
    const library = await cheerpjRunLibrary("/app" + jarUrl.pathname);
    return await library.gjfweb.api.BrowserFormatter;
  })();

  return {
    ready,

    async version() {
      return await (await ready).version();
    },

    async format(text, range, signal, options = {}) {
      const formatter = await ready;
      if (disposed) {
        throw new Error("formatter disposed");
      }
      const json = await formatter.format(
        text,
        options.style ?? "GOOGLE",
        options.fixImports ?? true,
        options.formatJavadoc ?? true,
        options.reorderModifiers ?? true,
        options.reflowLongStrings ?? true,
        range?.[0] ?? 0,
        range?.[1] ?? 0,
      );
      if (signal?.aborted) {
        throw new DOMException("formatting aborted", "AbortError");
      }
      const result = JSON.parse(json);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.output;
    },

    // CheerpJ has no teardown: once started it stays for the life of the page. Disposing
    // only stops this wrapper from serving further calls.
    dispose() {
      disposed = true;
    },
  };
}

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(
        new Error(
          `could not load the CheerpJ runtime from ${url}. The runtime is fetched from ` +
            "Leaning Technologies' CDN; a blocked network or a content security policy that " +
            "forbids the script will land here.",
        ),
      );
    document.head.append(script);
  });
}
