// A stand-in for CheerpJ's loader, used to test the worker protocol without the network.
//
// It defines the same globals the real loader defines, with the same async shapes:
// cheerpjInit resolves, cheerpjRunLibrary resolves to a package tree, and a static method
// resolves to its return value. What it does NOT do is run Java, so it proves the message
// plumbing, not the formatter. The formatter itself is covered by verify.sh on a real JVM.

globalThis.cheerpjInit = async (options) => {
  globalThis.__mockCheerpjInit = options;
  if (options && options.javaVersion === "unsupported") {
    throw new Error("unsupported java version");
  }
};

globalThis.cheerpjRunLibrary = async (classPath) => {
  globalThis.__mockCheerpjClassPath = classPath;
  const BrowserFormatter = {
    async version() {
      return "mock-1.36.1";
    },
    async format(source, style, fixImports, formatJavadoc, reorderModifiers, reflow, startLine, endLine) {
      if (source.startsWith("SLOW")) {
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      if (source.includes("TRIGGER_ERROR")) {
        return JSON.stringify({ ok: false, error: "3:7: error: mock parse failure" });
      }
      const flags = [fixImports, formatJavadoc, reorderModifiers, reflow].map(Number).join("");
      return JSON.stringify({ ok: true, output: `${style}|${flags}|${startLine}:${endLine}|${source}` });
    },
  };
  return { gjfweb: { api: { BrowserFormatter } } };
};
