# google-java-format-for-vs-code README

Format your java files using Google Java Format program which follows Google Java Style (or AOSP).

## Extension Settings

This extension contributes the following settings:

* `java.format.settings.google.executable`: *Not Recommended.* Specifies url or file path to [Google Java Format jar executable](https://github.com/google/google-java-format/releases). Overrides `java.format.settings.google.version`.
* `java.format.settings.google.version`: *Recommended.* Specifies version to be used of [Google Java Format jar executable](https://github.com/google/google-java-format/releases) in format `{major}.{minor}.{patch}`. Default: `latest`.
* `java.format.settings.google.extra`: Extra CLI arguments to pass to [Google Java Format](https://github.com/google/google-java-format).

Please refer [Google Java Format repository](https://github.com/google/google-java-format) for available versions and CLI arguments.

To debug this extenion and see how exactly it invokes the formatter, use _Developer: Set Log Level..._ to enable _Debug_ for this extension, and then open the _Output_ tab and select this extension.

---
**Enjoy!**
