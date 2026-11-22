#!/bin/zsh
# Start the patched OpenClaw Gateway (foreground) with this project's isolated state.
# Web chat: the URL printed by ./open-ui.sh
source "${0:A:h}/env.sh"
exec node "$SANTA_ROOT/openclaw/openclaw.mjs" gateway run --port 19789 --bind loopback "$@"
