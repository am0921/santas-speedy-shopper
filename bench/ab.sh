#!/bin/zsh
# Runs the same prompt through several agent variants at once (each in fresh sessions).
# Usage: bench/ab.sh <prompt-file> <runs-per-agent> <label> agent1 agent2 ...
source "${0:A:h}/../env.sh"
cd "$SANTA_ROOT"
prompt=$1; n=$2; label=$3; shift 3
for a in "$@"; do
  node bench/oc-run.mjs --prompt-file "$prompt" --agent "$a" --label "$label-$a" --n "$n" > "logs/ab-$label-$a.txt" 2>&1 &
done
wait
for a in "$@"; do echo "== $a"; cut -c1-220 "logs/ab-$label-$a.txt"; done
