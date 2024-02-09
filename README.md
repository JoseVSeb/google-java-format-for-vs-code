# Google Java Format for VS Code

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/josevseb.google-java-format-for-vs-code.svg)](https://marketplace.visualstudio.com/items?itemName=josevseb.google-java-format-for-vs-code)
[![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/josevseb.google-java-format-for-vs-code.svg)](https://marketplace.visualstudio.com/items?itemName=josevseb.google-java-format-for-vs-code)
[![Visual Studio Marketplace Rating Stars](https://img.shields.io/visual-studio-marketplace/stars/josevseb.google-java-format-for-vs-code.svg)](https://marketplace.visualstudio.com/items?itemName=josevseb.google-java-format-for-vs-code)
[![GitHub](https://img.shields.io/github/issues/JoseVSeb/google-java-format-for-vs-code.svg)](https://github.com/JoseVSeb/google-java-format-for-vs-code/issues)
[![release workflow](https://github.com/JoseVSeb/google-java-format-for-vs-code/actions/workflows/release.yaml/badge.svg)](https://github.com/JoseVSeb/google-java-format-for-vs-code/actions/workflows/release.yaml)
[![semantic-release: conventional commit](https://img.shields.io/badge/semantic--release-conventionalcommit-e10079?logo=semantic-release)](https://github.com/semantic-release/semantic-release)

Format your java files using Google Java Format program which follows Google Java Style (or AOSP).

## Extension Settings

This extension contributes the following settings:

* `java.format.settings.google.executable`: *Not Recommended.* Specifies url or file path to [Google Java Format jar executable](https://github.com/google/google-java-format/releases). Overrides `java.format.settings.google.version`.
* `java.format.settings.google.version`: *Recommended.* Specifies version to be used of [Google Java Format jar executable](https://github.com/google/google-java-format/releases) in format `{major}.{minor}.{patch}`. Default: `latest`.
* `java.format.settings.google.extra`: Extra CLI arguments to pass to [Google Java Format](https://github.com/google/google-java-format).

Please refer [Google Java Format repository](https://github.com/google/google-java-format) for available versions and CLI arguments.

## How to Debug

To debug this extension and see how exactly it invokes the formatter, use *Developer: Set Log Level...* to enable *Debug* for this extension, and then open the *Output* tab and select this extension.

---
**Enjoy!**
