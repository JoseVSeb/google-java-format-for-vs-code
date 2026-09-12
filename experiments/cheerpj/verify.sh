#!/usr/bin/env bash
# Checks the browser bundle against the official release it was built from.
#
#   1. every class in the bundle is at or below the target class file version
#   2. the bundle runs on a real Java 17 JVM with no --add-exports flags
#   3. formatting a corpus of real Java sources produces byte-identical output
#      to the official jar running on JDK 21
set -euo pipefail

cd "$(dirname "$0")"
unset JAVA_TOOL_OPTIONS || true

JDK21_HOME="${JDK21_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"
JDK17_HOME="${JDK17_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"
CORPUS_SIZE="${CORPUS_SIZE:-2000}"
TARGET_MAJOR="${TARGET_MAJOR:-61}"

build=build
bundle=dist/gjf-cheerpj.jar
gjf_jar=$(ls "$build"/downloads/google-java-format-*-all-deps.jar | tail -1)

[ -f "$bundle" ] || { echo "error: run ./build.sh first" >&2; exit 1; }

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
fail() { printf '\033[31mFAIL\033[0m %s\n' "$1"; exit 1; }
pass() { printf '\033[32mPASS\033[0m %s\n' "$1"; }

step "Checking class file versions in the bundle"
rm -rf "$build/bundle-check"
mkdir -p "$build/bundle-check"
(cd "$build/bundle-check" && unzip -qo "$OLDPWD/$bundle")
too_new=$(python3 - "$build/bundle-check" "$TARGET_MAJOR" <<'PY'
import pathlib, struct, sys
root, target = pathlib.Path(sys.argv[1]), int(sys.argv[2])
bad = [str(p) for p in root.rglob('*.class')
       if struct.unpack('>H', p.read_bytes()[6:8])[0] > target]
print('\n'.join(bad))
PY
)
[ -z "$too_new" ] || fail "classes above major $TARGET_MAJOR:"$'\n'"$too_new"
pass "all $(find "$build/bundle-check" -name '*.class' | wc -l) classes are at major $TARGET_MAJOR or below"

step "Checking for leftover references to the host JVM's compiler"
leftovers=$(python3 - "$build/bundle-check" <<'PY'
import pathlib, sys

root = pathlib.Path(sys.argv[1])
prefix_slash, prefix_dot = b"gjfweb/shaded/", b"gjfweb.shaded."
needles = [(b"com/sun/tools/javac", prefix_slash), (b"com.sun.tools.javac", prefix_dot),
           (b"com/sun/source/", prefix_slash), (b"com.sun.source.", prefix_dot)]
bad = []
for path in root.rglob("*.class"):
    data = path.read_bytes()
    for needle, prefix in needles:
        start = 0
        while (i := data.find(needle, start)) != -1:
            if data[max(0, i - len(prefix)):i] != prefix:
                bad.append(f"{path}: {needle.decode()}")
                break
            start = i + 1
        else:
            continue
        break
print("\n".join(bad))
PY
)
[ -z "$leftovers" ] || fail "references to the platform compiler survived relocation:"$'\n'"$leftovers"
pass "every reference to the JDK compiler packages is under the relocated prefix"

step "Scanning for platform API the target release does not provide"
asm_cp="$build/downloads/asm-${ASM_VERSION:-9.9}.jar"
rm -rf "$build/classes/scan"
mkdir -p "$build/classes/scan"
"$JDK17_HOME/bin/javac" -nowarn --release 17 -cp "$asm_cp" -d "$build/classes/scan" \
  tools/src/gjfcheerpj/verify/ApiScanner.java
"$JDK17_HOME/bin/java" -cp "$asm_cp:$build/classes/scan:$bundle" \
  gjfcheerpj.verify.ApiScanner "$bundle" > "$build/apiscan.txt" || true
head -1 "$build/apiscan.txt"
unexpected=$(comm -23 \
  <(grep '^  ' "$build/apiscan.txt" | sed 's/^  //' | sort) \
  <(grep -v '^#' verify-allowlist.txt | grep -v '^[[:space:]]*$' | sort))
[ -z "$unexpected" ] || fail "bundled code calls API missing from the target release:"$'\n'"$unexpected"
pass "every reference resolves on Java 17, except the documented allowlist"

step "Building corpus of real Java sources"
corpus="$build/corpus"
rm -rf "$corpus"
mkdir -p "$corpus"
gjf_version=$(basename "$gjf_jar" | sed 's/google-java-format-\(.*\)-all-deps.jar/\1/')
guava_version="${GUAVA_VERSION:-33.7.1-jre}"
sources=(
  "com/google/googlejavaformat/google-java-format/$gjf_version/google-java-format-$gjf_version-sources.jar"
  "com/google/guava/guava/$guava_version/guava-$guava_version-sources.jar"
)
for path in "${sources[@]}"; do
  jar="$build/downloads/$(basename "$path")"
  [ -f "$jar" ] || curl -fsSL -o "$jar" "${MAVEN_CENTRAL:-https://repo1.maven.org/maven2}/$path"
  unzip -qo "$jar" '*.java' -d "$corpus/$(basename "$path" .jar)"
done
find "$corpus" -name '*.java' | sort | awk "NR % ${CORPUS_STRIDE:-1} == 0" | head -n "$CORPUS_SIZE" > "$build/corpus.txt"
find testdata -name '*.java' >> "$build/corpus.txt"
[ -d ../../src/test/fixtures ] && find ../../src/test/fixtures -name '*.java' >> "$build/corpus.txt"
echo "$(wc -l < "$build/corpus.txt") files"

step "Compiling the corpus runner against both jars"
rm -rf "$build/classes/verify-ref" "$build/classes/verify-bundle"
mkdir -p "$build/classes/verify-ref" "$build/classes/verify-bundle"
"$JDK21_HOME/bin/javac" -nowarn -cp "$gjf_jar" -d "$build/classes/verify-ref" tools/src/gjfcheerpj/verify/CorpusRunner.java
"$JDK17_HOME/bin/javac" -nowarn --release 17 -cp "$bundle" -d "$build/classes/verify-bundle" tools/src/gjfcheerpj/verify/CorpusRunner.java

step "Reference run: official jar on $("$JDK21_HOME/bin/java" -version 2>&1 | head -1 | cut -d'"' -f2)"
rm -rf "$build/out-ref" "$build/out-bundle"
time "$JDK21_HOME/bin/java" \
  --add-exports jdk.compiler/com.sun.tools.javac.api=ALL-UNNAMED \
  --add-exports jdk.compiler/com.sun.tools.javac.code=ALL-UNNAMED \
  --add-exports jdk.compiler/com.sun.tools.javac.file=ALL-UNNAMED \
  --add-exports jdk.compiler/com.sun.tools.javac.parser=ALL-UNNAMED \
  --add-exports jdk.compiler/com.sun.tools.javac.tree=ALL-UNNAMED \
  --add-exports jdk.compiler/com.sun.tools.javac.util=ALL-UNNAMED \
  -cp "$gjf_jar:$build/classes/verify-ref" gjfcheerpj.verify.CorpusRunner "$build/out-ref" "$build/corpus.txt"

step "Bundle run: browser bundle on $("$JDK17_HOME/bin/java" -version 2>&1 | head -1 | cut -d'"' -f2), no JVM flags"
time "$JDK17_HOME/bin/java" \
  -cp "$bundle:$build/classes/verify-bundle" gjfcheerpj.verify.CorpusRunner "$build/out-bundle" "$build/corpus.txt"

step "Comparing output"
if diff -r "$build/out-ref" "$build/out-bundle" > "$build/diff.txt" 2>&1; then
  pass "$(ls "$build/out-ref" | wc -l) files formatted identically by both"
else
  head -40 "$build/diff.txt"
  fail "output differs, see $build/diff.txt"
fi

errors=$(grep -rl "^RUNTIME-ERROR" "$build/out-bundle" || true)
if [ -n "$errors" ]; then
  echo
  echo "note: $(echo "$errors" | wc -l) file(s) hit a runtime error in both runs:"
  echo "$errors" | head -5
fi

step "All checks passed"
