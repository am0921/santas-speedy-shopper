#!/bin/zsh
# One-shot setup: official speed patch + OpenClaw 8b18b55, build, isolated state, config.
# Everything stays inside this folder (nothing is written to ~/.openclaw).
set -e
cd "${0:A:h}"

PATCH_REPO=https://github.com/wkasekende/openclaw-speed-patch.git
OPENCLAW_REPO=https://github.com/openclaw/openclaw.git
OPENCLAW_COMMIT=8b18b5578f66eab1501cba4cef2310d88bfb9a41

echo "== 1/4 official speed patch"
[ -d vendor/openclaw-speed-patch ] || git clone --depth 1 "$PATCH_REPO" vendor/openclaw-speed-patch

echo "== 2/4 OpenClaw $OPENCLAW_COMMIT + patch"
if [ ! -d openclaw/.git ]; then
  mkdir -p openclaw
  (
    cd openclaw
    git init -q
    git remote add origin "$OPENCLAW_REPO"
    git fetch --depth 1 origin "$OPENCLAW_COMMIT"
    git checkout -q FETCH_HEAD
    git -c user.name="speed-bounty" -c user.email="speed-bounty@example.invalid" \
      am ../vendor/openclaw-speed-patch/openclaw-cerebras-kimi-on-8b18b55.patch
  )
fi

echo "== 3/4 build (pnpm install, build, ui:build)"
./build-openclaw.sh

echo "== 4/4 state and config"
mkdir -p state logs
[ -s state/gateway-token ] || { openssl rand -hex 24 > state/gateway-token; chmod 600 state/gateway-token; }
[ -f .env ] || { printf 'CEREBRAS_API_KEY=\n' > .env; chmod 600 .env; }
source ./env.sh
node make-config.mjs

if ! grep -q '^CEREBRAS_API_KEY=.\+' .env; then
  echo
  echo "Now put your Cerebras API key in .env (CEREBRAS_API_KEY=...), then run ./run-gateway.sh"
else
  echo
  echo "Ready. Start with ./run-gateway.sh and open the URL printed by ./open-ui.sh"
fi
