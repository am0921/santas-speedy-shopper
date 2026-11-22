# Santa's Speedy Shopper

Speed Bounty entry for the Cerebras × Moonshot AI Kimi K3.1 Pro × OpenClaw hackathon.

An OpenClaw agent running **Kimi K3.1 Pro on Cerebras** takes a Christmas wish list, searches real online stores live, and answers with five real products and their product page links. The whole run is two model calls.

## How it works

```
user:   Find five Christmas gifts from real shopping websites:
        stanley tumbler, brooklinen robe, leatherman multitool, deathwish mug, puravida bracelet.

call 1: Kimi calls the plugin tool   gifts({"list": "stanley tumbler, brooklinen robe, ..."})
tool:   five live storefront searches in parallel, top in-stock hit per store
call 2: Kimi answers with the five products: title, price, product page URL
```

- `plugin/santa-shop/` is an OpenClaw plugin with the live search tools. It queries each retailer's public storefront search endpoint (`/search/suggest.json`) at call time. The only static data is the list of storefronts in `stores.js`; every product, price and link comes from the live response.
- `agents/gifts/AGENTS.md` is the agent's standing instruction (five lines).
- `make-config.mjs` writes the OpenClaw config: Kimi K3.1 Pro on Cerebras (`https://api.cerebras.ai/v1`, model `moonshotai-kimi-k3.1-pro-trial`, thinking level `low`), tool search off so the tool schema is sent directly, and no background model calls.

## Speed

TPS is measured by the official [OpenClaw speed patch](https://github.com/wkasekende/openclaw-speed-patch), unmodified. It reads Cerebras' own server-side timing for every model call (`usage.completion_tokens / time_info.completion_time`) and shows the mean over the calls of a response.

What we learned by measuring (see `bench/` and `research/`):

| Output kind | Typical server rate |
| --- | --- |
| Free prose, reasoning tokens | 230–310 tok/s |
| Tool call | 600–1,000 tok/s |
| Text copied verbatim from context | 850–1,300 tok/s |

So the run is designed to spend its tokens where Kimi on Cerebras is fastest: almost no reasoning (thinking level `low`, a terse instruction, nothing left to decide), a tool call whose argument is copied from the request, and a final answer that repeats the live results.

## Reproduce

Requirements: Node 24.22+, pnpm (via corepack), a Cerebras API key with access to `moonshotai-kimi-k3.1-pro-trial`.

```bash
# 1. Patched OpenClaw (commit 8b18b55 + official speed patch)
git clone https://github.com/openclaw/openclaw.git && cd openclaw && git checkout 8b18b55
git am ../vendor/openclaw-speed-patch/openclaw-cerebras-kimi-on-8b18b55.patch
pnpm install && pnpm build && pnpm ui:build && cd ..

# 2. Key and config
echo "CEREBRAS_API_KEY=..." > .env
mkdir -p state && openssl rand -hex 24 > state/gateway-token
node make-config.mjs

# 3. Run
./run-gateway.sh                 # Gateway + web chat on http://127.0.0.1:19789
./open-ui.sh                     # prints the web chat URL
```

Open the web chat, pick the `gifts` agent, and send the prompt in `prompts/list.txt`. The speed readout appears on the response and next to the message box.

Scripted runs with per-call timing read back from the session history:

```bash
source env.sh
node bench/oc-run.mjs --agent gifts --prompt-file prompts/list.txt --n 10
```

## Layout

| Path | What |
| --- | --- |
| `plugin/santa-shop/` | OpenClaw plugin: live storefront search tools |
| `agents/` | Agent variants compared during tuning (`gifts` is the entry) |
| `prompts/` | Prompts used in runs |
| `bench/` | Direct-API microbenchmarks and the OpenClaw run harness |
| `record/` | Automated recorder for the web chat demo video |
| `research/` | Notes from the research phase |
| `vendor/openclaw-speed-patch/` | The official patch, as published |
