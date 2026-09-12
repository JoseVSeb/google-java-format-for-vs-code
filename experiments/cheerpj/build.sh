#!/usr/bin/env bash
# Builds a browser-loadable bundle of the official google-java-format release.
#
# Inputs:  the -all-deps jar published on Maven Central, plus jdk.compiler /
#          java.compiler taken from a local JDK 21 image.
# Output:  dist/gjf-cheerpj.jar, loadable by a Java 17 JVM such as CheerpJ's,
#          with no --add-exports flags and no dependency on the host JVM's
#          own compiler module.
#
# Environment:
#   GJF_VERSION   google-java-format release to bundle (default: latest on Maven Central)
#   JDK21_HOME    JDK 21+ image supplying javac        (default: /usr/lib/jvm/java-21-openjdk-amd64)
#   JDK17_HOME    JDK 17 used to compile and verify    (default: /usr/lib/jvm/java-17-openjdk-amd64)
set -euo pipefail

cd "$(dirname "$0")"
unset JAVA_TOOL_OPTIONS || true

JDK21_HOME="${JDK21_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"
JDK17_HOME="${JDK17_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"
ASM_VERSION="${ASM_VERSION:-9.9}"
MAVEN_CENTRAL="${MAVEN_CENTRAL:-https://repo1.maven.org/maven2}"
GJF_GROUP_PATH="com/google/googlejavaformat/google-java-format"

build=build
downloads="$build/downloads"
classes="$build/classes"
jdkmods="$build/jdkmods"
resources="$build/resources"
dist=dist

for home in "$JDK21_HOME" "$JDK17_HOME"; do
  [ -x "$home/bin/javac" ] || { echo "error: no JDK at $home" >&2; exit 1; }
done

mkdir -p "$downloads" "$dist"

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

step "Resolving google-java-format release"
if [ -z "${GJF_VERSION:-}" ]; then
  GJF_VERSION=$(curl -fsSL "$MAVEN_CENTRAL/$GJF_GROUP_PATH/maven-metadata.xml" |
    sed -n 's:.*<release>\(.*\)</release>.*:\1:p' | tail -1)
fi
echo "google-java-format $GJF_VERSION"

gjf_jar="$downloads/google-java-format-$GJF_VERSION-all-deps.jar"
if [ ! -f "$gjf_jar" ]; then
  step "Downloading official release artifact"
  curl -fsSL -o "$gjf_jar" \
    "$MAVEN_CENTRAL/$GJF_GROUP_PATH/$GJF_VERSION/google-java-format-$GJF_VERSION-all-deps.jar"
fi
echo "$(du -h "$gjf_jar" | cut -f1)  $gjf_jar"

step "Downloading ASM $ASM_VERSION"
for artifact in asm asm-tree asm-commons; do
  jar="$downloads/$artifact-$ASM_VERSION.jar"
  [ -f "$jar" ] || curl -fsSL -o "$jar" \
    "$MAVEN_CENTRAL/org/ow2/asm/$artifact/$ASM_VERSION/$artifact-$ASM_VERSION.jar"
done
asm_cp="$downloads/asm-$ASM_VERSION.jar:$downloads/asm-tree-$ASM_VERSION.jar:$downloads/asm-commons-$ASM_VERSION.jar"

step "Extracting jdk.compiler and java.compiler from $($JDK21_HOME/bin/java -version 2>&1 | head -1)"
rm -rf "$jdkmods"
mkdir -p "$jdkmods"
"$JDK21_HOME/bin/jimage" extract --dir "$jdkmods" "$JDK21_HOME/lib/modules" > /dev/null
[ -d "$jdkmods/jdk.compiler" ] || { echo "error: jdk.compiler missing from image" >&2; exit 1; }
find "$jdkmods" -mindepth 1 -maxdepth 1 -type d \
  ! -name jdk.compiler ! -name java.compiler ! -name jdk.internal.opt -exec rm -rf {} +
echo "jdk.compiler: $(find "$jdkmods/jdk.compiler" -name '*.class' | wc -l) classes"
echo "java.compiler: $(find "$jdkmods/java.compiler" -name '*.class' | wc -l) classes"

step "Compiling the bundler"
rm -rf "$classes"
mkdir -p "$classes/tools" "$classes/runtime" "$classes/api"
"$JDK21_HOME/bin/javac" -nowarn -cp "$asm_cp" -d "$classes/tools" \
  tools/src/gjfcheerpj/build/*.java

step "Compiling the Java 17 switch bootstrap shim"
"$JDK17_HOME/bin/javac" -nowarn --release 17 -d "$classes/runtime" \
  $(find runtime/src -name '*.java')

step "Assembling the bundle (pass 1: relocate, retarget, rewrite)"
rm -rf "$resources"
mkdir -p "$resources/gjfweb"
echo "$GJF_VERSION" > "$resources/gjfweb/gjf-version.txt"
bundle="$dist/gjf-cheerpj.jar"
staged="$build/stage1.jar"
jdk_build=$("$JDK21_HOME/bin/java" -XshowSettings:properties -version 2>&1 |
  sed -n 's/^ *java.runtime.version = //p')
bundler() {
  "$JDK21_HOME/bin/java" -cp "$asm_cp:$classes/tools" gjfcheerpj.build.BundleBuilder \
    --prefix "gjfweb/shaded/" \
    --target 61 \
    --main-class gjfweb.api.BrowserFormatter \
    --manifest "Bundle-Gjf-Version=$GJF_VERSION" \
    --manifest "Bundle-Compiler-Jdk=$jdk_build" \
    "$@"
}
bundler \
  --jar "$gjf_jar" \
  --dir "$jdkmods/jdk.compiler" \
  --dir "$jdkmods/java.compiler" \
  --dir "$jdkmods/jdk.internal.opt" \
  --dir "$classes/runtime" \
  --dir "$resources" \
  --out "$staged"

step "Compiling the JavaScript-facing API against the bundle"
"$JDK17_HOME/bin/javac" -nowarn --release 17 -cp "$staged" -d "$classes/api" \
  $(find api/src -name '*.java')

step "Assembling the bundle (pass 2: fold in the API)"
# The transformations are idempotent, so re-running them over the staged jar only
# folds in the API classes. Appending with "jar uf" instead would stamp those
# entries with the current time and make the build unreproducible.
bundler --jar "$staged" --dir "$classes/api" --out "$bundle"

step "Generating browser self-test fixtures"
selftest_inputs=(testdata/*.java)
[ -f ../../src/test/fixtures/UnformattedSample.java ] &&
  selftest_inputs+=(../../src/test/fixtures/UnformattedSample.java)
python3 - "$bundle" "$JDK17_HOME" web/selftest.json "${selftest_inputs[@]}" <<'SELFTEST'
import json, pathlib, subprocess, sys

bundle, jdk17, out = sys.argv[1], sys.argv[2], sys.argv[3]
cases = []
for path in sys.argv[4:]:
    formatted = subprocess.run(
        [f"{jdk17}/bin/java", "-cp", bundle, "gjfweb.api.BrowserFormatter", path],
        capture_output=True, text=True, check=True).stdout
    cases.append({
        "name": pathlib.Path(path).name,
        "input": pathlib.Path(path).read_text(),
        "expected": formatted,
    })
pathlib.Path(out).write_text(json.dumps({"cases": cases}, indent=2) + "\n")
print(f"{len(cases)} case(s) -> {out}")
SELFTEST

step "Done"
ls -la "$bundle"
echo
echo "Next: ./verify.sh          (runs the bundle on a real Java 17 JVM)"
echo "      ./serve.sh          (serves the CheerpJ demo at /web/)"
