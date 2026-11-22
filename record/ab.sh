#!/bin/zsh
# Alternates variants attempt by attempt in the web chat (recorded), so they see the same
# server conditions. Each variant is agent[:prompt-file].
# Usage: [AB_WAIT=<max queue seconds>] record/ab.sh <rounds> santa santa7:prompts/xmas-fast.txt ...
cd "${0:A:h}/.."
rounds=$1; shift
for i in $(seq 1 "$rounds"); do
  for v in "$@"; do
    a=${v%%:*}; p=${v#*:}; [ "$p" = "$v" ] && p=prompts/xmas.txt
    [ -n "$AB_WAIT" ] && node bench/wait-ready.mjs 10 "$AB_WAIT" > /dev/null 2>&1
    node record/record.mjs --agent "$a" --prompt-file "$p" --n 1 --expand-tool --height 1080 2>&1 | grep -E '^#' | sed "s/^/$a /" | cut -c1-150
  done
done
