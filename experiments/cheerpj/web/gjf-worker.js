// Runs CheerpJ and the formatter inside a dedicated Web Worker.
//
// CheerpJ has supported workers since 3.0rc2: importScripts the loader and use the API as
// usual. Nothing here touches the DOM, which is the one thing a worker cannot provide, so
// headless library mode is the supported shape. This matters for VS Code for the Web,
// whose extension host is itself a worker with no document to draw on.
//
// Protocol: every message carries an id, and every reply is {id, ok, result} or
// {id, ok: false, error}. Requests are served one at a time because the JVM call is
// synchronous inside CheerpJ; queuing here keeps the JavaScript side honest about that.

let formatterPromise = null;
const queue = [];
let draining = false;

self.onmessage = (event) => {
  const request = event.data;
  if (request.type === "dispose") {
    self.close();
    return;
  }
  queue.push(request);
  drain();
};

async function drain() {
  if (draining) {
    return;
  }
  draining = true;
  while (queue.length > 0) {
    const request = queue.shift();
    try {
      self.postMessage({ id: request.id, ok: true, result: await handle(request) });
    } catch (error) {
      self.postMessage({ id: request.id, ok: false, error: describe(error) });
    }
  }
  draining = false;
}

async function handle(request) {
  switch (request.type) {
    case "init":
      return await boot(request);
    case "version":
      return await (await formatter()).version();
    case "format":
      return await runFormat(request);
    default:
      throw new Error(`unknown request type: ${request.type}`);
  }
}

async function boot(request) {
  formatterPromise ??= load(request);
  await formatterPromise;
  return { ready: true };
}

function formatter() {
  if (formatterPromise === null) {
    throw new Error("worker used before init");
  }
  return formatterPromise;
}

async function load({ loaderUrl, jarPath, javaVersion }) {
  try {
    importScripts(loaderUrl);
  } catch (error) {
    throw new Error(
      `could not load the CheerpJ runtime from ${loaderUrl}: ${describe(error)}. ` +
        "The runtime is fetched from Leaning Technologies' CDN; a blocked network or a " +
        "content security policy that forbids the script will land here.",
    );
  }
  if (typeof cheerpjInit !== "function") {
    throw new Error(`${loaderUrl} loaded but did not define cheerpjInit`);
  }

  // status: "none" is required off the main thread: the default loading indicator draws
  // into the document, and a worker has none.
  await cheerpjInit({ javaVersion, status: "none" });
  const library = await cheerpjRunLibrary(jarPath);
  return await library.gjfweb.api.BrowserFormatter;
}

async function runFormat({ source, options }) {
  const o = options ?? {};
  const json = await (await formatter()).format(
    source,
    o.style ?? "GOOGLE",
    o.fixImports ?? true,
    o.formatJavadoc ?? true,
    o.reorderModifiers ?? true,
    o.reflowLongStrings ?? true,
    o.startLine ?? 0,
    o.endLine ?? 0,
  );
  const result = JSON.parse(json);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.output;
}

function describe(error) {
  if (error instanceof Error) {
    return error.message;
  }
  // CheerpJ rejects with a Java exception proxy, which stringifies usefully but is not an Error.
  return String(error && error.message ? error.message : error);
}
