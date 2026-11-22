#!/bin/zsh
# One-shot setup: official speed patch + OpenClaw 8b18b55, build, isolated state, config.
# Everything stays inside this folder (nothing is written to ~/.openclaw). Safe to re-run.
set -e
cd "${0:A:h}"

PATCH_REPO=https://github.com/wkasekende/openclaw-speed-patch.git
# The patch revision our numbers were measured with, and the checksum of the patch file.
PATCH_COMMIT=e40e9f7b7ec41ad3fa68181ad297db119e755171
PATCH_FILE=vendor/openclaw-speed-patch/openclaw-cerebras-kimi-on-8b18b55.patch
PATCH_SHA256=c964a28808c8d9e33aaaa2897dea951e595dd35c2d4047484eb6e5e97059c9c0
OPENCLAW_REPO=https://github.com/openclaw/openclaw.git
OPENCLAW_COMMIT=8b18b5578f66eab1501cba4cef2310d88bfb9a41

echo "== 1/4 official speed patch ($PATCH_COMMIT)"
if [ ! -f "$PATCH_FILE" ]; then
  mkdir -p vendor/openclaw-speed-patch
  (
    cd vendor/openclaw-speed-patch
    [ -d .git ] || git init -q
    git remote get-url origin >/dev/null 2>&1 || git remote add origin "$PATCH_REPO"
    git fetch --depth 1 origin "$PATCH_COMMIT"
    git checkout -q FETCH_HEAD
  )
fi
if [ "$(shasum -a 256 "$PATCH_FILE" | cut -d' ' -f1)" != "$PATCH_SHA256" ]; then
  echo "The speed patch file differs from the one this entry was measured with ($PATCH_FILE)." >&2
  exit 1
fi

echo "== 2/4 OpenClaw $OPENCLAW_COMMIT + patch"
patched() {
  [ -d openclaw/.git ] && [ ! -d openclaw/.git/rebase-apply ] &&
    [ "$(git -C openclaw rev-list --count "$OPENCLAW_COMMIT"..HEAD 2>/dev/null)" = 2 ] &&
    [ -z "$(git -C openclaw status --porcelain --untracked-files=no)" ]
}
if ! patched; then
  if [ -d openclaw/.git ]; then
    echo "openclaw/ exists but is not $OPENCLAW_COMMIT plus the 2 patch commits." >&2
    echo "Move it away (for example: mv openclaw openclaw.broken) and run ./setup.sh again." >&2
    exit 1
  fi
  mkdir -p openclaw
  (
    cd openclaw
    git init -q
    git remote add origin "$OPENCLAW_REPO"
    git fetch --depth 1 origin "$OPENCLAW_COMMIT"
    git checkout -q FETCH_HEAD
    git -c user.name="speed-bounty" -c user.email="speed-bounty@example.invalid" \
      am "../$PATCH_FILE"
  )
  patched || { echo "Applying the speed patch failed." >&2; exit 1; }
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
