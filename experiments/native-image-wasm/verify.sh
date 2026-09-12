#!/usr/bin/env bash
# Compares the WebAssembly image against the official release over a corpus of real Java
# sources: the reference is the official jar on a normal JVM, the candidate is the image
# running in a browser. The native image is checked the same way, as a control.
#
#   CORPUS_SIZE   files to compare (default 25)
#   PORT          static server port (default 8124)
set -euo pipefail

cd "$(dirname "$0")"
unset JAVA_TOOL_OPTIONS || true

JDK_HOME="${JDK_HOME:-${GRAALVM_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}}"
MAVEN_CENTRAL="${MAVEN_CENTRAL:-https://repo1.maven.org/maven2}"
CORPUS_SIZE="${CORPUS_SIZE:-25}"
build=build
jar=$(ls "$build"/downloads/google-java-format-*-all-deps.jar | tail -1)
version=$(basename "$jar" | sed 's/google-java-format-\(.*\)-all-deps.jar/\1/')

[ -f dist/gjf-wasm.js ] || { echo "error: run TARGET=wasm ./build.sh first" >&2; exit 1; }

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
pass() { printf '\033[32mPASS\033[0m %s\n' "$1"; }
fail() { printf '\033[31mFAIL\033[0m %s\n' "$1"; exit 1; }

step "Building the corpus"
corpus="$build/corpus"
rm -rf "$corpus"; mkdir -p "$corpus"
sources="$build/downloads/google-java-format-$version-sources.jar"
[ -f "$sources" ] || curl -fsSL -o "$sources" \
  "$MAVEN_CENTRAL/com/google/googlejavaformat/google-java-format/$version/google-java-format-$version-sources.jar"
unzip -qo "$sources" '*.java' -d "$corpus"
mapfile -t files < <(find "$corpus" sample -name '*.java' | sort | head -n "$CORPUS_SIZE")
echo "${#files[@]} files"

step "Generating references with the official jar on $("$JDK_HOME/bin/java" -version 2>&1 | head -1 | cut -d'"' -f2)"
python3 - "$jar" "$JDK_HOME" web/selftest.json "${files[@]}" <<'PY'
import json, pathlib, subprocess, sys
jar, jdk, out = sys.argv[1], sys.argv[2], sys.argv[3]
cases = []
for path in sys.argv[4:]:
    expected = subprocess.run([f"{jdk}/bin/java", "-jar", jar, path],
                              capture_output=True, text=True, check=True).stdout
    cases.append({"name": pathlib.Path(path).name,
                  "input": pathlib.Path(path).read_text(),
                  "expected": expected})
pathlib.Path(out).write_text(json.dumps({"cases": cases}, indent=2) + "\n")
print(f"{len(cases)} reference outputs")
PY

if [ -x dist/gjf-native ]; then
  step "Control: the native image"
  mismatch=0
  for file in "${files[@]}"; do
    diff <(dist/gjf-native "$file") <("$JDK_HOME/bin/java" -jar "$jar" "$file") > /dev/null || {
      mismatch=$((mismatch + 1)); echo "  differs: $file"; }
  done
  [ "$mismatch" -eq 0 ] && pass "${#files[@]} files identical to the official jar" \
    || fail "$mismatch native mismatches"
fi

step "The WebAssembly image, in a browser"
./test.sh
