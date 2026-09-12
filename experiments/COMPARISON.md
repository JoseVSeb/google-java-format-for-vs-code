# CheerpJ versus WebAssembly: measured comparison

Two routes to running the official google-java-format release in a browser, measured on the same
machine against the same three input files. Reproduce with `cheerpj/verify.sh` and
`native-image-wasm/verify.sh`.

**Read the gap in the evidence first.** The WebAssembly route was measured in a browser. The
CheerpJ route was not: this container's egress policy blocks `cjrtnc.leaningtech.com`, so CheerpJ's
runtime never loaded here. Its column below is the compatibility layer's cost on a desktop JVM,
which is a floor, not a browser number. CheerpJ's JIT will be slower than a stock JVM by some
factor nobody here has measured.

## Format latency

Times are per call, for the whole pipeline the extension uses: format, fix imports, reflow long
strings. Warm means a process that has already formatted the same file several times.

| Input | Official jar, JVM 21, warm | CheerpJ bundle, JVM 17, warm | WebAssembly in a browser | Native binary, cold process | Official jar CLI, cold process |
|---|---|---|---|---|---|
| 1.2 KB | 27 ms | 25 ms | 240 ms | 14 ms | 409 ms |
| 10.9 KB | 36 ms | 44 ms | 409 ms | 26 ms | 594 ms |
| 133 KB | 206 ms | 347 ms | 1180 ms | 281 ms | 1352 ms |

The WebAssembly numbers are medians of six warm calls with the compiled module cached, and each
one still carries a fresh VM boot. Caching the module is worth having: without it the same calls
take 736, 546 and 1503 ms, because the wrapper recompiles all 14.6 MB every time. Reusing the
booted isolate instead is not possible, and the reason is not WebAssembly or the worker: calling
`main` twice on a live instance dies with "overwriting existing java.lang.Thread". The flat
200 ms floor on a small file is that per-call boot.

The compatibility layer costs the CheerpJ bundle nothing on small files and about 70 percent on the
largest one, measured on a desktop JVM. The likely cause is the switch shim: pattern-matching
switches become linear label scans instead of the JDK's bootstrap, and the formatter's hot path is
a large type switch over javac tree nodes.

## Startup, payload and build

| | CheerpJ route | WebAssembly route |
|---|---|---|
| Runtime source | Leaning Technologies' CDN | self-hosted beside the extension |
| Shipped by us | 7.2 MB jar | 14.6 MB module, 6.2 MB gzipped, plus a 94 KB wrapper |
| Additional download | CheerpJ runtime, tens of MB, not measured here | none |
| Worker and wrapper init | not measured | 22 to 35 ms |
| First format after load | not measured | about 1.4 s, including module fetch and instantiation |
| Later formats | VM stays warm | fresh VM per call |
| Build time | about 40 s for the bundle | 63 s for the module, plus 107 s for the native control |
| Build inputs | official jar, JDK 21 image, JDK 17 | official jar, Oracle GraalVM 25.1+, Binaryen |
| Per-release work | rebuild and re-verify the compatibility layer | rebuild |

## Worker and runtime caveats

| Concern | CheerpJ | WebAssembly (Web Image) |
|---|---|---|
| Runs in a Web Worker | yes, since 3.0rc2, via `importScripts`; not verified here | yes, verified here |
| DOM | needs `status: "none"`, or the loading indicator reaches for a document | never touches the DOM |
| JavaScript API | real object API through `cheerpjRunLibrary` | none: the wrapper runs `main` on load and keeps `GraalVM` in its closure |
| Getting an API anyway | not needed | fetch the wrapper, replace its bootstrap line, load it from a blob URL |
| Content security policy | must allow a script from the CDN | self-hosted, but needs `blob:` in the worker's script sources and `wasm-unsafe-eval` |
| Standard output | not used, calls return values | captured by reference at load, so a forwarder must be installed before the wrapper loads |
| Persistent VM | yes | module stays compiled, but the isolate cannot be re-entered, so one boot per call |
| Cancellation | a call cannot be interrupted | same |
| Input size | strings, no limit | no limit in a browser; 128 KB per argument under Node or a shell, because the source goes through argv |
| Threads | Java threads supported | none; measured that the format path creates none |
| Filesystem | virtual filesystem | none; source passed inline, measured that the format path opens no files |
| Java version ceiling | Java 17, so the release needs retargeting | none, compiled against JDK 25 |
| Licensing | CheerpJ is proprietary, free for personal use and evaluation; bundle redistributes OpenJDK compiler classes under GPL+CE | image built with Oracle GraalVM under GFTC, free for production; nothing repackaged |
| Maturity | CheerpJ 4.3 is a shipping product | Web Image is experimental |

## What each route still has to prove

| | CheerpJ | WebAssembly |
|---|---|---|
| Runs in a browser at all | unverified here, CDN blocked | verified, 25 of 25 files identical to the official jar |
| Latency in a browser | unmeasured | measured above |
| Memory per call | unmeasured | unmeasured |
| Safari | CheerpJ supports it | WasmGC is shipped everywhere, but the VS Code floor is unchecked |
| VS Code extension host | nested worker and CSP unchecked | same, plus the blob URL requirement above |
