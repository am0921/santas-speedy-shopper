#!/bin/zsh
# Build the patched OpenClaw checkout. Needs Node >=24.22.1 (its engines field);
# when mise is installed, Node 24.22.3 is installed and used automatically.
set -e
cd "${0:A:h}/openclaw"
if command -v mise >/dev/null 2>&1; then
  mise install node@24.22.3
  export PATH="$(mise where node@24.22.3)/bin:$PATH"
fi
node --version
corepack pnpm --version
corepack pnpm install
corepack pnpm build
corepack pnpm ui:build
echo BUILD_DONE
