# google-java-format-for-vs-code README

Format your java files using Google Java Format program which follows Google Java Style (or AOSP).

## Extension Settings

This extension contributes the following settings:

* `java.format.settings.google.executable`: Specifies url or file path to [Google Java Format jar executable](https://github.com/google/google-java-format/releases).
* `java.format.settings.google.version`: Specifies version to be used of [Google Java Format jar executable](https://github.com/google/google-java-format/releases). Default: `1.17.0`. Overridden by `java.format.settings.google.executable`.
* `java.format.settings.google.extra`: Extra CLI arguments to pass to [Google Java Format](https://github.com/google/google-java-format).

Please refer [Google Java Format repository](https://github.com/google/google-java-format) for available versions and CLI arguments.

## Release Notes

### 0.1.0

Initial release of Google Java Format for VS Code.

Run Google Java Format jar to format java files.

Auto-download executable jar from either url or full version string.

Add extra CLI arguments to Google Java Format call using extension setting.

## 0.1.1

Fix extension activation in vs code v1.78.

## 0.1.2

Update default google java format version to 1.17.0.

## 0.1.3

Fix issue with path of executable containing space.

---
**Enjoy!**
