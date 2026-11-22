# Source this to work with the isolated, patched OpenClaw checkout of this project.
# Keeps all OpenClaw state inside ./state (nothing is written to ~/.openclaw).
SANTA_ROOT="${0:A:h}"
# OpenClaw at this commit needs Node >=24.22.1. Use mise's copy when present, otherwise the Node on PATH.
if command -v mise >/dev/null 2>&1 && mise where node@24.22.3 >/dev/null 2>&1; then
  export PATH="$(mise where node@24.22.3)/bin:$PATH"
fi
export OPENCLAW_STATE_DIR="$SANTA_ROOT/state"
export OPENCLAW_CONFIG_PATH="$SANTA_ROOT/state/openclaw.json"
export OPENCLAW_GATEWAY_TOKEN="$(cat "$SANTA_ROOT/state/gateway-token")"
export OPENCLAW_GATEWAY_PORT=19789
export OPENCLAW_DISABLE_BONJOUR=1 OPENCLAW_SKIP_CHANNELS=1 OPENCLAW_NO_AUTO_UPDATE=1
set -a; . "$SANTA_ROOT/.env"; set +a
oc() { node "$SANTA_ROOT/openclaw/openclaw.mjs" "$@"; }
