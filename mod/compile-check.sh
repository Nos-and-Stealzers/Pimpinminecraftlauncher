#!/usr/bin/env bash
# Compile the given Minecraft versions (default: all) and print only compiler errors.
cd "$(dirname "$0")"
# Needs JDK 25 (JAVA_HOME or on PATH).
args=()
for v in "$@"; do args+=(":$v:compileJava"); done
[ ${#args[@]} -eq 0 ] && args=(compileJava)
./gradlew "${args[@]}" --continue --console=plain -q 2>&1 | grep -E "error:|warning: \[|What went wrong|Execution failed|^\s+symbol|^\s+location|BUILD" | sed -E 's#.*versions[\\/]([^\\/]+)[\\/]build[\\/]preprocessed[\\/]java[\\/]#[\1] #'
