#!/usr/bin/env bash
# Measures whether google-java-format's format path stays inside a WebAssembly target's limits:
# no threads of its own, and no filesystem access. Runs on a stock JDK with the official release.
set -euo pipefail

cd "$(dirname "$0")"
unset JAVA_TOOL_OPTIONS || true

JDK_HOME="${JDK_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"
MAVEN_CENTRAL="${MAVEN_CENTRAL:-https://repo1.maven.org/maven2}"
GJF_PATH="com/google/googlejavaformat/google-java-format"
build=build
sample="${1:-sample/Sample.java}"

mkdir -p "$build/downloads" "$build/classes"

if [ -z "${GJF_VERSION:-}" ]; then
  GJF_VERSION=$(curl -fsSL "$MAVEN_CENTRAL/$GJF_PATH/maven-metadata.xml" |
    sed -n 's:.*<release>\(.*\)</release>.*:\1:p' | tail -1)
fi
jar="$build/downloads/google-java-format-$GJF_VERSION-all-deps.jar"
[ -f "$jar" ] || curl -fsSL -o "$jar" \
  "$MAVEN_CENTRAL/$GJF_PATH/$GJF_VERSION/google-java-format-$GJF_VERSION-all-deps.jar"

exports=(
  --add-exports jdk.compiler/com.sun.tools.javac.api=ALL-UNNAMED
  --add-exports jdk.compiler/com.sun.tools.javac.code=ALL-UNNAMED
  --add-exports jdk.compiler/com.sun.tools.javac.file=ALL-UNNAMED
  --add-exports jdk.compiler/com.sun.tools.javac.parser=ALL-UNNAMED
  --add-exports jdk.compiler/com.sun.tools.javac.tree=ALL-UNNAMED
  --add-exports jdk.compiler/com.sun.tools.javac.util=ALL-UNNAMED
)

echo "google-java-format $GJF_VERSION on $("$JDK_HOME/bin/java" -version 2>&1 | head -1)"
"$JDK_HOME/bin/javac" -nowarn -cp "$jar" -d "$build/classes" \
  src/gjfwasm/Main.java probe/RuntimeShapeProbe.java

echo
echo "== threads =="
"$JDK_HOME/bin/java" "${exports[@]}" -cp "$jar:$build/classes" probe.RuntimeShapeProbe "$sample"

echo
echo "== files opened =="
if ! command -v strace > /dev/null; then
  echo "strace not installed; skipping the filesystem measurement"
  exit 0
fi
strace -f -e trace=openat -o "$build/trace.txt" \
  "$JDK_HOME/bin/java" "${exports[@]}" -cp "$jar:$build/classes" \
  probe.RuntimeShapeProbe "$sample" > /dev/null 2>&1
# Everything the JVM itself needs is filtered out; what remains is what formatting touched.
grep -o 'openat([^)]*"[^"]*"' "$build/trace.txt" |
  sed 's/.*"\(.*\)"/\1/' | sort -u |
  grep -v "^/usr/lib/jvm\|^/proc\|^/sys\|^/etc\|^/usr/lib/x86_64\|^/lib/x86_64\|^/usr/share/locale\|^/usr/lib/locale\|^/dev\|^/tmp/hsperfdata\|^\.$" |
  sed 's/^/  /'
echo "  (above: the jar, the compiled probe and the input file; nothing else)"
