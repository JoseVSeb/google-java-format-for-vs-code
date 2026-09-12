#!/usr/bin/env bash
# Compiles the official google-java-format release ahead of time, either to a native binary
# or to WebAssembly, using GraalVM Native Image.
#
# The build arguments are google-java-format's own, lifted from the `native` profile in its
# core/pom.xml, which is how its published native binaries are made. That profile is the
# evidence that javac's internals survive AOT compilation: the --add-exports flags are
# -J options for the builder JVM, so the module encapsulation that forces --add-exports at
# runtime on a normal JVM simply does not exist in the image.
#
#   TARGET        native (default) or wasm
#   GRAALVM_HOME  GraalVM with native-image; Web Image needs Oracle GraalVM 25.1 or later
#   GJF_VERSION   release to compile (default: latest on Maven Central)
set -euo pipefail

cd "$(dirname "$0")"
unset JAVA_TOOL_OPTIONS || true

TARGET="${TARGET:-native}"
MAVEN_CENTRAL="${MAVEN_CENTRAL:-https://repo1.maven.org/maven2}"
GJF_PATH="com/google/googlejavaformat/google-java-format"
build=build
dist=dist

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

native_image="${GRAALVM_HOME:-}/bin/native-image"
if [ ! -x "$native_image" ]; then
  cat >&2 <<'MSG'
error: no native-image found.

Set GRAALVM_HOME to a GraalVM installation. For TARGET=wasm that must be Oracle
GraalVM 25.1 or later, which is where the Web Image backend (--tool:svm-wasm) lives.

  In CI:      graalvm/setup-graalvm@v1 with distribution: graalvm, java-version: 25
  Locally:    https://www.graalvm.org/downloads/

Nothing else here needs GraalVM: ./probe.sh measures the runtime shape on a stock JDK.
MSG
  exit 1
fi

case "$TARGET" in
  native|wasm) ;;
  *) echo "error: TARGET must be native or wasm, got $TARGET" >&2; exit 1 ;;
esac

mkdir -p "$build/downloads" "$build/classes" "$dist"

step "Resolving google-java-format release"
if [ -z "${GJF_VERSION:-}" ]; then
  GJF_VERSION=$(curl -fsSL "$MAVEN_CENTRAL/$GJF_PATH/maven-metadata.xml" |
    sed -n 's:.*<release>\(.*\)</release>.*:\1:p' | tail -1)
fi
echo "google-java-format $GJF_VERSION"

jar="$build/downloads/google-java-format-$GJF_VERSION-all-deps.jar"
[ -f "$jar" ] || curl -fsSL -o "$jar" \
  "$MAVEN_CENTRAL/$GJF_PATH/$GJF_VERSION/google-java-format-$GJF_VERSION-all-deps.jar"

step "Compiling the entry point"
"${GRAALVM_HOME}/bin/javac" -nowarn -cp "$jar" -d "$build/classes" src/gjfwasm/Main.java

# google-java-format ships META-INF/native-image/reachability-metadata.json inside the jar,
# which is what registers its reflective access to the javac parser; native-image picks it
# up from the classpath with no extra flags.
args=(
  -H:+UnlockExperimentalVMOptions
  -H:IncludeResourceBundles=com.sun.tools.javac.resources.compiler
  -H:IncludeResourceBundles=com.sun.tools.javac.resources.javac
  --no-fallback
  --initialize-at-build-time=com.sun.tools.javac.file.Locations
  -H:+ReportExceptionStackTraces
  -H:-UseContainerSupport
  -J--add-exports=jdk.compiler/com.sun.tools.javac.api=ALL-UNNAMED
  -J--add-exports=jdk.compiler/com.sun.tools.javac.code=ALL-UNNAMED
  -J--add-exports=jdk.compiler/com.sun.tools.javac.file=ALL-UNNAMED
  -J--add-exports=jdk.compiler/com.sun.tools.javac.parser=ALL-UNNAMED
  -J--add-exports=jdk.compiler/com.sun.tools.javac.tree=ALL-UNNAMED
  -J--add-exports=jdk.compiler/com.sun.tools.javac.util=ALL-UNNAMED
)

if [ "$TARGET" = "wasm" ]; then
  args+=(--tool:svm-wasm)
  output="$dist/gjf-wasm"
else
  args+=(-march=compatibility)
  output="$dist/gjf-native"
fi

step "Building the $TARGET image with $("${GRAALVM_HOME}/bin/native-image" --version | head -1)"
"$native_image" "${args[@]}" -cp "$jar:$build/classes" gjfwasm.Main -o "$output"

step "Done"
ls -la "$dist"
if [ "$TARGET" = "native" ]; then
  echo
  echo "Smoke test:"
  "$output" sample/Sample.java | head -5
fi
