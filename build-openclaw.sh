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
node -e 'const [a,b,c]=process.versions.node.split(".").map(Number);const ok=(a===24&&(b>22||(b===22&&c>=1)))||(a===26&&(b>12||(b===12&&c>=1)))||a>26;if(!ok){console.error("OpenClaw at this commit needs Node >=24.22.1 <25 or >=26.12.1 (found "+process.version+"). Install mise (https://mise.jdx.dev) or Node 24.22.3.");process.exit(1)}'
command -v corepack >/dev/null || { echo "corepack is missing: run 'npm i -g corepack' and try again." >&2; exit 1; }
corepack pnpm --version
corepack pnpm install
corepack pnpm build
corepack pnpm ui:build
echo BUILD_DONE
