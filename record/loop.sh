#!/bin/zsh
# Unattended recording: wait until the Cerebras endpoint is calm, record a few attempts
# one after another (fresh session each), prune, repeat. Stops after <hours>.
# Usage: record/loop.sh [hours=6] [attempts-per-batch=4]
cd "${0:A:h}/.."
source ./env.sh
hours=${1:-6}; batch=${2:-4}
end=$(( $(date +%s) + hours * 3600 ))
while [ $(date +%s) -lt $end ]; do
  if node bench/wait-ready.mjs 15 1 > /dev/null 2>&1; then
    node record/record.mjs --n "$batch" --expand-tool --height 1080 --gap-ms 4000 2>&1 | grep -E '^#'
    node record/prune.mjs 12
  else
    echo "$(date +%T) still congested"
  fi
done
