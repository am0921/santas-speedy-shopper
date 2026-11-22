#!/bin/zsh
# Alternates agents run by run (so drifting server load hits them equally), fresh session each.
# Usage: bench/interleave.sh <prompt-file> <rounds> <label> agent1 agent2 ...
source "${0:A:h}/../env.sh"
cd "$SANTA_ROOT"
prompt=$1; rounds=$2; label=$3; shift 3
for i in $(seq 1 "$rounds"); do
  for a in "$@"; do
    node bench/oc-run.mjs --prompt-file "$prompt" --agent "$a" --label "$label-$a" --n 1 | cut -c1-230
  done
done
node bench/summary.mjs "$label-" | grep -E "^$label|run mean|call 1|last call|model calls"
