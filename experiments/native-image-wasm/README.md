# google-java-format as WebAssembly, without CheerpJ

**It works.** The official google-java-format release, compiled ahead of time by GraalVM Native
Image, runs as a WebAssembly module in a browser and produces byte-identical output to the
official jar on a JVM. No JVM in the browser, no CheerpJ, nothing fetched from a third party.

Verified in Chromium in this repository, on a 25-file corpus of google-java-format's own sources
plus the sample fixtures. Reproduce with `./build.sh` then `./verify.sh`.

## Results

| | |
|---|---|
| Corpus formatted identically to the official jar, in a browser | 25 of 25 files |
| Native image, same corpus, as a control | 25 of 25 files |
| WebAssembly module | 14.6 MB, 6.2 MB gzipped, plus a 94 KB JS wrapper |
| Native binary, for comparison | 33 MB |
| Format call in the browser | 240 to 460 ms per file, including a fresh VM boot each time |
| Build time | 1 min 3 s for the wasm image, 1 min 47 s for the native one |
| Toolchain | Oracle GraalVM 25.0.4 with Binaryen 123 |

The CheerpJ bundle next door is 7.2 MB, but it also needs CheerpJ's own runtime from Leaning
Technologies' CDN on top. This route ships 6.2 MB over the wire and nothing else.

## Why javac was not the obstacle

The instinct is that the formatter cannot be compiled ahead of time because it reaches into
`com.sun.tools.javac`. Google already does it: every release ships native binaries built by
`mvn -Pnative`, and that profile shows how. The six `--add-exports` flags are `-J` options, so
they configure the *builder* JVM. Module encapsulation is a load-time concept and an AOT image
has none left at run time, which is exactly the problem the CheerpJ route spends its whole
compatibility layer on. The javac resource bundles are named with `-H:IncludeResourceBundles`,
`Locations` is initialised at build time, and the reflective parser access is declared in
`META-INF/native-image/reachability-metadata.json` inside the release jar. `build.sh` uses that
configuration unchanged.

## What did get in the way

Three things, none of them javac:

1. **Binaryen.** The backend assembles the module with `wasm-as`, and says so if it is missing.
   Ubuntu's packaged Binaryen 108 is too old; the upstream release works.
2. **Stricter image-heap scanning.** The wasm backend rejects the two javac resource bundles that
   the native backend accepts, so both need `--initialize-at-build-time`.
3. **A float compare-and-set the backend cannot compile.** This one is worth knowing about.
   `Trees` in google-java-format builds a `VarHandle` in its static initialiser to reach
   `JCCompilationUnit.endPositions`. Leaving that to run time drags the whole `VarHandle` family
   into the image, and the backend's atomics phase then dies compiling
   `VarHandleFloats$FieldStaticReadWrite.compareAndSet` with an internal error. Initialising
   `com.google.googlejavaformat.java.Trees` at build time resolves the handle during the build and
   the generic machinery never becomes reachable. This is the sort of failure that would look
   fatal at a glance and is a one-flag fix.

Before that, the runtime shape was measured rather than assumed, because a wasm target has no
native threads and no real filesystem. `./probe.sh` shows the format path creates no threads and
opens no files. That prediction held: the module runs with a virtual filesystem and never misses.

## The wrapper has no module export yet

Web Image emits a JavaScript file that runs the Java `main` with the host's command line
arguments as soon as it loads, and keeps its `GraalVM` object inside its own closure. In 25.0.4
there is no module export to import, and `--shared` does not add one.

So `web/gjf-wasm-worker.js` fetches the wrapper as text and replaces its final bootstrap line with
one that publishes an awaitable entry point, leaving the rest of the file untouched. Two details
matter and are easy to miss:

- The wrapper resolves its module path from its own script URL, which is wrong once the text is
  evaluated somewhere else. `config.wasm_path` overrides it.
- Standard output goes through `console.log`, captured *by reference* when the wrapper loads. A
  forwarder has to be installed before evaluation; swapping `console.log` afterwards is ignored.

Each call boots a fresh VM, because nothing in the wrapper offers a way to re-enter `main`. That
is most of the 240 to 460 ms. A persistent API is the obvious next step and is what `@JS.Export`
in `org.graalvm.webimage.api` is for; it needs an export mechanism the wrapper actually surfaces,
so it is worth retrying on a newer GraalVM before building anything on the patch above.

## Usage

```sh
TARGET=native ./build.sh   # build the native binary first: it is Google's own configuration,
                           # so a failure there is a setup problem, not a backend one
TARGET=wasm   ./build.sh   # build the WebAssembly module
./verify.sh                # diff both against the official jar over a corpus, in a browser
./test.sh                  # just the browser self-test
./probe.sh                 # threads and file access, on a stock JDK, no GraalVM needed
```

`build.sh` needs `GRAALVM_HOME` pointing at Oracle GraalVM 25.1 or later, which is where the Web
Image backend lives, and Binaryen's `wasm-as` on `PATH` or in `WASM_AS_PATH`. `ci/build-wasm.yaml`
does all of it on a GitHub runner and is inert until moved into `.github/workflows/`.

The build leaves a `.wat` text dump of a few hundred megabytes; it is deleted unless `KEEP_WAT` is
set, since it is only useful when debugging the backend.

## How this compares with the CheerpJ route

| | CheerpJ (`../cheerpj`) | Web Image (here) |
|---|---|---|
| Compatibility work | relocate javac, retarget bytecode to Java 17, shim Java 21 APIs, 3 stand-in classes | none, three build flags |
| Third-party runtime | CheerpJ, proprietary, from their CDN | none |
| Over the wire | 7.2 MB jar plus CheerpJ's runtime | 6.2 MB gzipped |
| Licensing | Apache 2.0 plus GPL+CE javac classes redistributed, plus a CheerpJ licence | Apache 2.0, image built with Oracle GraalVM under GFTC |
| Verified in a browser | not here: the CDN is blocked in this container | yes, 25 of 25 files |
| Per-format cost | not measured | 240 to 460 ms, dominated by VM boot |
| Maturity | CheerpJ 4.3 is a shipping product | Web Image is experimental |

On the evidence so far this route is ahead on every axis except maturity. It needs no
compatibility layer to maintain per release, it removes a proprietary runtime and the question of
redistributing OpenJDK compiler classes, and it is the one that has actually been seen working in
a browser.

## Still open

1. **A persistent VM.** Re-booting per call costs most of the latency. Needs either an export
   mechanism from a newer Web Image or a supported way to re-enter the image.
2. **Safari.** WasmGC is shipped across browsers, but the floor for the extension's supported VS
   Code versions is unverified.
3. **Memory.** Peak browser memory per call was not measured.
4. **Extension host integration.** VS Code for the Web runs extensions in a worker; this already
   runs in one, but nested workers and the host's content security policy still need checking.

## Layout

```
build.sh            AOT build, TARGET=native or TARGET=wasm
verify.sh           corpus diff against the official jar, browser included
test.sh             browser self-test only
probe.sh            threads and file access measurement, no GraalVM needed
src/gjfwasm         the entry point compiled into the image
probe/              the measurement harness
web/                worker, client and demo page for the wasm module
test/               the browser test
sample/             Java sources used as fixtures
ci/build-wasm.yaml  template workflow, inert until moved into .github/workflows/
```
