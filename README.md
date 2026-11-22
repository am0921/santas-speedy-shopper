# Santa's Speedy Shopper

Speed Bounty entry for the Cerebras × Moonshot AI Kimi K3.1 Pro × OpenClaw hackathon.

Santa gets a wish list. An OpenClaw agent running **Kimi K3.1 Pro on Cerebras** shops it live on real online stores and answers with five real products and their product page links. The whole run is two model calls.

## How it works

```
user:   Find five Christmas gifts from real shopping websites:
        puravida christmas, colourpop holiday, leatherman wave, brooklinen robe, ugmonk tray.

call 1: Kimi calls the plugin tool   gifts({"list": "puravida christmas, colourpop holiday, ..."})
tool:   five live storefront searches in parallel, top in-stock hit per store
call 2: Kimi answers with the five products: title, price, product page URL
```

- `plugin/santa-shop/` is an OpenClaw plugin with the live search tools. It queries each retailer's public storefront search endpoint (`/search/suggest.json`) at call time.
- `agents/gifts/AGENTS.md` is the agent's standing instruction (five lines).
- `make-config.mjs` writes the OpenClaw config.

### Nothing is hard-coded

The only static data is the list of storefront domains in `plugin/santa-shop/stores.js`. It is configuration, like the list of sites a search tool is allowed to query. **No product, price or link exists anywhere in this repo.** Every line of the answer comes from the retailer's live response during the run, so:

- results change when a store changes its catalog, stock or prices. A rerun proves the lookup is live; it is not expected to return the same five products forever;
- a store that is down shows up as `- search failed for <store>: ...` in the answer. There is no fallback data;
- prices are shown as the storefront lists them. A product whose variants differ in price is shown as a range (for example `$139.00-$149.00`).

The wish-list prompt names a store and a search word per gift, the way a person hands over a shopping list. The agent also works with an open prompt (`prompts/plain.txt` with the `shop` tool, which returns three candidates per store and lets Kimi choose stores, search words and products). That variant is slower because Kimi has more to decide and writes more of its own text; see the table below.

## Speed

TPS is measured by the official [OpenClaw speed patch](https://github.com/wkasekende/openclaw-speed-patch), unmodified. It reads Cerebras' own server-side timing for every model call (`usage.completion_tokens / time_info.completion_time`) and shows the mean over the calls of a response.

What we learned by measuring Kimi K3.1 Pro on Cerebras (scripts in `bench/`):

| Output kind | Typical server rate |
| --- | --- |
| Free prose, reasoning tokens | 230–310 tok/s |
| Tool call | 600–1,000 tok/s |
| Text copied verbatim from context | 850–1,300 tok/s |

So the run is designed to spend its tokens where Kimi on Cerebras is fastest:

- **Almost no reasoning.** Reasoning cannot be switched off for this model (`low` is the lowest effort the API accepts), so the instruction is terse and the request leaves nothing to decide. Reasoning stays at roughly 10–20 tokens per call.
- **A tool call copied from the request.** One call with one string argument taken verbatim from the wish list. A single string decodes faster than a JSON array of the same items (mean 982 vs 793 tok/s in our test).
- **An answer copied from the live results.** The tool returns lines that are ready to show, and Kimi repeats them.

Run-to-run noise is large (the same 147-token answer took between 96 and 190 ms of server decode time), and the service is slower when it is busy. Results by configuration, all through the patched OpenClaw Gateway:

| Configuration | Runs | Median | Best |
| --- | --- | --- | --- |
| Open prompt, `shop` tool, no instruction file | 1 | 561 | 561 |
| Wish list, `shop` tool (three candidates per store) | 8 | 702 | 1,096 |
| Wish list, `gift` tool (five parallel calls) | 16 | 843 | 1,132 |
| Wish list, `gifts` tool (one call), this entry | 40 | 847 | 1,167 |

The `gifts` row includes 14 runs made while the service was returning `queue_exceeded` errors; over the 26 runs made before that, its median was 959.

### What we did not do

Calls cut off by a tiny `max_completion_tokens` report absurd rates (30,000+ tok/s) because all their tokens arrive in the first streamed burst. Such calls do no work, so this entry does not use them: `maxTokens` is 1024, far above the ~100 and ~170 tokens the two calls produce, and both calls end with a normal stop.

## Settings that differ from the patch's example config

The model, base URL, thinking level (`low`) and supported reasoning efforts are the ones from the patch's `dev/cerebras-kimi/openclaw.json`. Added in `make-config.mjs`:

| Setting | Why |
| --- | --- |
| `tools.toolSearch: false`, `tools.allow: ["gifts"]` | Send the one tool's schema directly instead of hiding tools behind `tool_search`, which costs extra model calls |
| `agents.defaults.skipBootstrap`, `skills: []` | No first-run ritual and no skills directory in the prompt |
| `heartbeat.every: "0m"`, `utilityModel: ""`, `skills.workshop.autonomous.mode: "off"` | No background model calls during a run |
| `maxTokens: 1024` | Plenty for the answer; smaller reservation against the per-minute token limit |
| `plugins.load.paths` | Loads `plugin/santa-shop` |

Nothing in OpenClaw itself is modified. `openclaw/` is commit `8b18b55` plus the two commits of the official patch.

## Reproduce

Requirements: macOS or Linux with zsh, git, Node 24.22+ (installed automatically if you use [mise](https://mise.jdx.dev)), and a Cerebras API key with access to `moonshotai-kimi-k3.1-pro-trial`.

```bash
./setup.sh          # official patch + OpenClaw 8b18b55, build, isolated state in ./state
```

Put your key in `.env` (`CEREBRAS_API_KEY=...`), then:

```bash
./run-gateway.sh    # Gateway + web chat on http://127.0.0.1:19789
```

```bash
./open-ui.sh        # prints the web chat URL (includes the local access token)
```

In the web chat, start a new conversation and send the prompt in `prompts/xmas.txt`. The speed readout appears on the response and next to the message box. Use a fresh conversation per attempt so both readouts cover the same single run. All OpenClaw state stays in `./state`; nothing is written to `~/.openclaw`.

Scripted runs, with per-call timing read back from the session history (the same `serverGeneration` values the readout aggregates):

```bash
source env.sh && node bench/oc-run.mjs --agent gifts --prompt-file prompts/xmas.txt --n 10 && node bench/summary.mjs
```

Record an attempt in the web chat as a video:

```bash
node record/record.mjs --prompt-file prompts/xmas.txt --n 5
```

## Layout

| Path | What |
| --- | --- |
| `plugin/santa-shop/` | OpenClaw plugin: live storefront search tools (`gifts`, `gift`, `shop`) |
| `agents/` | Agent instruction files. `gifts` is the entry; the others are variants compared during tuning (`node make-config.mjs --variants`) |
| `prompts/` | Prompts used in runs |
| `bench/` | Direct-API microbenchmarks and the OpenClaw run harness |
| `record/` | Automated recorder for the web chat demo video |
| `setup.sh`, `run-gateway.sh`, `env.sh`, `make-config.mjs` | Setup and run scripts |
