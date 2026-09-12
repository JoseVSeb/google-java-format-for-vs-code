# google-java-format to WebAssembly, without CheerpJ (experiment)

Can the formatter be compiled to WebAssembly directly, instead of running a JVM in the browser?
Short answer: this is the more promising of the two routes, and javac is not what stands in the
way. What stands in the way is that the toolchain is experimental and could not be run here.

## Why javac is not the blocker

The instinct is that google-java-format cannot be compiled ahead of time because it reaches into
`com.sun.tools.javac` internals. Google already does it. Every release ships GraalVM native
binaries for four platforms, built by `mvn -Pnative`, and that profile says exactly how:

- The six `--add-exports` flags are passed as `-J` options, meaning they configure the *builder*
  JVM, not the image. Module encapsulation is a load-time concept, and an AOT image has no module
  system left to fight at run time. The problem the CheerpJ route spends most of its effort on
  simply does not arise.
- Two javac resource bundles are named explicitly with `-H:IncludeResourceBundles`.
- `com.sun.tools.javac.file.Locations` is initialised at build time.
- The reflective calls into the parser are declared in `META-INF/native-image/reachability-metadata.json`,
  which is shipped inside the release jar. Native Image reads it off the classpath unaided.

So the AOT closure over javac is a solved problem with a published recipe. `build.sh` uses that
recipe verbatim and adds one flag, `--tool:svm-wasm`, which switches Native Image to its Web Image
backend and emits a `.wasm` module plus a JavaScript wrapper.

## What was measured here

A WebAssembly target restricts two things that would sink this if the formatter needed them:
native threads, and a real filesystem. Rather than assume, `./probe.sh` measures both on a stock
JDK with the official release. It downloads the jar, formats a file and traces the process:

| Measurement | Result |
|---|---|
| Threads created while formatting | none: 6 live before, 6 after, all of them JVM housekeeping |
| Files opened while formatting | none: only the jar, the probe's own classes and the input |

No temporary files, no `ct.sym`, no jrt image, no file manager reaching for the JDK. The formatter
wants a parser, not a filesystem, which is the shape a Wasm target can host.

## What was not done

The image was never built. Native Image cannot be obtained in this container: `graalvm.org` and
GitHub releases are blocked by the egress policy, and Maven Central's `org.graalvm.nativeimage`
artifacts stop at 22.0.0, years before the Web Image backend existed. `./build.sh` therefore fails
with a message saying what to install. Run it where GraalVM is available, or use the workflow in
`ci/` which does both targets on a GitHub runner.

Build the native target first. It is google-java-format's own configuration, so a failure there is
a setup problem, and only a failure in the wasm target after that says anything about the backend.

## How the two routes compare

| | CheerpJ (`../cheerpj`) | Web Image (here) |
|---|---|---|
| What ships | 7.6 MB jar plus CheerpJ's runtime, fetched from a third-party CDN | one `.wasm` module and a JS wrapper, self-hosted |
| Compatibility work | relocate javac, retarget bytecode to Java 17, shim Java 21 APIs | none: compiled against a JDK that already has javac |
| Tracks new releases | rebuild and re-verify the layer per release | rebuild |
| Licensing | google-java-format Apache 2.0, OpenJDK javac GPL+CE, CheerpJ proprietary | google-java-format Apache 2.0, image built with Oracle GraalVM under GFTC |
| Maturity | CheerpJ 4.3 is a shipping product | Web Image is experimental and marked as such |
| Verified | formatting matches the official jar byte for byte on a Java 17 JVM; browser leg untested | runtime shape measured; nothing built |

The licensing column is the strongest argument for this route. It removes a proprietary runtime
from the dependency chain, and it removes the question of redistributing OpenJDK compiler classes,
because nothing is repackaged: the compiler is linked into the image at build time.

## Open questions

1. **Does the closure build with the wasm backend?** The native target proves the closure exists.
   Whether Web Image handles all of it, particularly the reflective parser access, is the first
   thing the CI job answers.
2. **How large is the module?** google-java-format's native binaries are tens of megabytes. If the
   wasm module lands in that range it is heavier than the CheerpJ bundle, though it arrives without
   a separate JVM runtime, so compare totals rather than files.
3. **What does the JavaScript wrapper expose?** The entry point here is a plain `main` reading a
   file or standard input, which every target supports. A richer API for the extension should be
   designed against the wrapper's real interop surface, not guessed at now.
4. **Is Web Image in Community Edition?** The documentation names Oracle GraalVM 25.1 and later.
   Oracle GraalVM is free for production under GFTC, so this is a licence to read rather than a
   blocker, but a CE-only pipeline may not have the backend at all.
5. **WasmGC support in the field.** All major browsers have shipped it, Safari included, but the
   floor for the extension's supported VS Code versions still needs checking.

## Layout

```
build.sh            AOT build, TARGET=native or TARGET=wasm; needs GraalVM
probe.sh            measures threads and file access on a stock JDK; needs no GraalVM
src/gjfwasm         the entry point compiled into the image
probe/              the measurement harness
sample/             a Java 21 source file to format
ci/build-wasm.yaml  template workflow, inert until moved into .github/workflows/
```
