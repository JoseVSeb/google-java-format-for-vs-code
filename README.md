# Google Java Format for VS Code

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/josevseb.google-java-format-for-vs-code.svg)](https://marketplace.visualstudio.com/items?itemName=josevseb.google-java-format-for-vs-code)
[![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/josevseb.google-java-format-for-vs-code.svg)](https://marketplace.visualstudio.com/items?itemName=josevseb.google-java-format-for-vs-code)
[![Visual Studio Marketplace Rating Stars](https://img.shields.io/visual-studio-marketplace/stars/josevseb.google-java-format-for-vs-code.svg)](https://marketplace.visualstudio.com/items?itemName=josevseb.google-java-format-for-vs-code)
[![Open VSX Registry](https://img.shields.io/open-vsx/v/josevseb/google-java-format-for-vs-code.svg)](https://open-vsx.org/extension/josevseb/google-java-format-for-vs-code)
[![GitHub](https://img.shields.io/github/issues/JoseVSeb/google-java-format-for-vs-code.svg)](https://github.com/JoseVSeb/google-java-format-for-vs-code/issues)
[![CI](https://github.com/JoseVSeb/google-java-format-for-vs-code/actions/workflows/ci.yaml/badge.svg)](https://github.com/JoseVSeb/google-java-format-for-vs-code/actions/workflows/ci.yaml)
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

To debug this extension and see how exactly it invokes the formatter, use *Developer: Set Log Level...* to enable *Debug* for this extension, and then open the *Output* tab and select this extension.

---
**Enjoy!**
