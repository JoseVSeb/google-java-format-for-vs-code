# Google Java Format for VS Code

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/josevseb.google-java-format-for-vs-code.svg)](https://marketplace.visualstudio.com/items?itemName=josevseb.google-java-format-for-vs-code)
[![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/josevseb.google-java-format-for-vs-code.svg)](https://marketplace.visualstudio.com/items?itemName=josevseb.google-java-format-for-vs-code)
[![Visual Studio Marketplace Rating Stars](https://img.shields.io/visual-studio-marketplace/stars/josevseb.google-java-format-for-vs-code.svg)](https://marketplace.visualstudio.com/items?itemName=josevseb.google-java-format-for-vs-code)
[![Open VSX Registry](https://img.shields.io/open-vsx/v/josevseb/google-java-format-for-vs-code.svg)](https://open-vsx.org/extension/josevseb/google-java-format-for-vs-code)
[![GitHub](https://img.shields.io/github/issues/JoseVSeb/google-java-format-for-vs-code.svg)](https://github.com/JoseVSeb/google-java-format-for-vs-code/issues)
[![release workflow](https://github.com/JoseVSeb/google-java-format-for-vs-code/actions/workflows/release.yaml/badge.svg)](https://github.com/JoseVSeb/google-java-format-for-vs-code/actions/workflows/release.yaml)
[![codecov](https://codecov.io/gh/JoseVSeb/google-java-format-for-vs-code/branch/main/graph/badge.svg)](https://codecov.io/gh/JoseVSeb/google-java-format-for-vs-code)
[![semantic-release: conventional commit](https://img.shields.io/badge/semantic--release-conventionalcommit-e10079?logo=semantic-release)](https://github.com/semantic-release/semantic-release)

Format your java files using Google Java Format program which follows Google Java Style (or AOSP).

## Installation

This extension is available on:
- [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=josevseb.google-java-format-for-vs-code) for VS Code
- [OpenVSX Registry](https://open-vsx.org/extension/josevseb/google-java-format-for-vs-code) for VSCodium, Cursor, and other VS Code compatible editors
- [GitHub Releases](https://github.com/JoseVSeb/google-java-format-for-vs-code/releases) as `.vsix` files for manual installation

## Extension Settings

There are two mutually-exclusive ways to configure which Google Java Format
executable the extension uses:

### Approach 1 – Automatic download (recommended)

Use `version` and `mode` together.  The extension contacts the GitHub Releases
API, resolves the correct download URL, caches the binary locally, and runs it
automatically.

* `java.format.settings.google.version`: The GJF release to use.  Accepts
  `"latest"` (default) or a concrete version string like `"1.25.2"`.
* `java.format.settings.google.mode`: Which artifact to download and run.
  * `"native-binary"` (default) – downloads and runs the platform-specific
    GraalVM native image.  No JVM is required at runtime; on platforms where a
    native image is not available the extension falls back to the jar.
  * `"jar-file"` – downloads and runs the all-deps JAR.  Requires Java 21+ on
    PATH.

### Approach 2 – Explicit executable path (advanced / not recommended)

* `java.format.settings.google.executable`: An absolute file path **or** an
  HTTP(S) URL pointing to a GJF executable (jar or native binary).  When set,
  this **overrides** `version` and `mode`; the extension uses the provided
  binary directly and skips the automatic download entirely.

### Shared setting

* `java.format.settings.google.extra`: Extra CLI arguments passed to GJF
  (e.g. `"--aosp"`).  This setting applies regardless of which configuration
  approach above is used.

Please refer to the [Google Java Format repository](https://github.com/google/google-java-format)
for available versions and CLI arguments.

## Extension Commands

This extension contributes the following commands:

* `Google Java Format For VS Code: Clear Cache`: Clear cache of [Google Java Format executable](https://github.com/google/google-java-format/releases) downloads by the extension.
* `Google Java Format For VS Code: Reload Executable`: Reload the [Google Java Format executable](https://github.com/google/google-java-format/releases) using the current configuration.

## How to Debug

### Enable verbose logging (no code changes required)

To see exactly how the extension invokes the formatter, enable debug-level logs at
runtime:

1. Open the **Output** panel (`View → Output`) and pick **Google Java Format For
   VS Code** from the drop-down.  This is the extension's dedicated log channel
   where every `fetch`, `execSync`, cache hit/miss, and error is printed.
2. To increase the log verbosity, open the Command Palette
   (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run **Developer: Set Log Level…**.
   > ⚠️ **Note:** this command sets the log level for the **entire VS Code
   > application**, not just this extension — setting it to *Debug* or *Trace*
   > will produce output from all extensions and internal VS Code services in
   > every Output channel.  Reset it to *Info* (the default) afterwards to
   > reduce noise.
3. Select **Debug** (or **Trace** for maximum verbosity) and confirm.  The
   extension's output channel will now show detailed diagnostic messages.

### Debug with breakpoints (Extension Development Host)

VS Code extensions run inside the editor's extension host process and expose two
lifecycle hooks that the runtime calls at well-defined points:

| Hook | When it runs |
|------|-------------|
| `activate(context)` | Called **once**, lazily, the first time the extension is needed — either when VS Code opens a Java file (matching the `activationEvents` in `package.json`) or when a command contributed by this extension is invoked. All subscriptions — document format providers, commands, and configuration-change listeners — are registered here. |
| `deactivate()` | Called when the extension is explicitly disabled or when VS Code is shutting down. Use it for synchronous cleanup that must complete before the process exits. |

> **Lazy activation explained:** VS Code does *not* start your extension at
> editor launch.  `activate` is only called when an activation event fires
> (e.g. a `.java` file is opened).  Until that happens the extension is
> dormant — no code runs, no listeners are registered.

To run the extension with breakpoints:

1. **Open the repository** in VS Code (`File → Open Folder…`).
2. Install dependencies: open a terminal and run `yarn install`.
3. Set breakpoints anywhere in `src/` in the *development* window — for
   example, at the top of `activate` in `extension.ts` or inside
   `provideDocumentRangeFormattingEdits`.
4. Press **F5** (or run **Run → Start Debugging**).  VS Code compiles the
   extension and launches a second **Extension Development Host** window with
   your local build loaded.
5. In the *host* window, open or create a `.java` file.  Opening it fires the
   `onLanguage:java` activation event, which causes VS Code to call
   `activate(context)` in your extension for the first time.  Breakpoints
   inside `activate` will be hit now.
6. Trigger formatting (`Shift+Alt+F` on Windows/Linux, `Shift+Option+F` on
   macOS) to hit breakpoints inside the formatting callbacks.

> **Tip:** if your breakpoint in `activate` is never hit, run one of the
> extension's commands (e.g. **Reload Executable**) from the host window's
> Command Palette — that also triggers activation without needing a `.java`
> file open.

---
**Enjoy!**
