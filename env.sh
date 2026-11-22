# Source this to work with the isolated, patched OpenClaw checkout of this project.
# Keeps all OpenClaw state inside ./state (nothing is written to ~/.openclaw).
if [ -z "$ZSH_VERSION" ]; then
  echo 'env.sh must be sourced from zsh, for example: zsh -c "source ./env.sh && node bench/oc-run.mjs ..."' >&2
  return 1 2>/dev/null || exit 1
fi
SANTA_ROOT="${0:A:h}"
# OpenClaw at this commit needs Node >=24.22.1. Use mise's copy when present, otherwise the Node on PATH.
if command -v mise >/dev/null 2>&1 && mise where node@24.22.3 >/dev/null 2>&1; then
  export PATH="$(mise where node@24.22.3)/bin:$PATH"
fi
export OPENCLAW_STATE_DIR="$SANTA_ROOT/state"
export OPENCLAW_CONFIG_PATH="$SANTA_ROOT/state/openclaw.json"
# The local access token is only used when the config asks for token auth (make-config.mjs --auth token).
if grep -q '"mode": "token"' "$SANTA_ROOT/state/openclaw.json" 2>/dev/null; then
  export OPENCLAW_GATEWAY_TOKEN="$(cat "$SANTA_ROOT/state/gateway-token")"
else
  unset OPENCLAW_GATEWAY_TOKEN
fi
export OPENCLAW_GATEWAY_PORT=19789
export OPENCLAW_DISABLE_BONJOUR=1 OPENCLAW_SKIP_CHANNELS=1 OPENCLAW_NO_AUTO_UPDATE=1
set -a; . "$SANTA_ROOT/.env"; set +a
oc() { node "$SANTA_ROOT/openclaw/openclaw.mjs" "$@"; }
