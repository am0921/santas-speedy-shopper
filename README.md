# Santa's Speedy Shopper

Speed Bounty entry for the Cerebras × Moonshot AI Kimi K3.1 Pro × OpenClaw hackathon.

Santa gets a wish list. An OpenClaw agent running **Kimi K3.1 Pro on Cerebras** shops it live on real online stores, checks that every product page is really there, and answers with five real products and their links. Making a list, checking it twice, in three model calls.

## How it works

```
user:   Find five Christmas gifts from real shopping websites:
        puravida christmas, colourpop holiday, leatherman wave, brooklinen robe, stanley tumbler.

call 1: Kimi calls   gift({"item": "puravida christmas"})  ... five calls in one turn
tools:  five live storefront searches, top in-stock hit per store
call 2: Kimi calls   verify({"url": "https://www.puravidabracelets.com/products/..."})  ... five calls in one turn
tools:  one live HEAD request per product page; only a 200 counts as verified
call 3: Kimi answers with the five verified products: title, price, product page URL
```

- `plugin/santa-shop/` is an OpenClaw plugin with the tools. `gift` queries a retailer's public storefront search endpoint (`/search/suggest.json`) at call time. `verify` asks the store for the product page itself and reports honestly: a page that does not answer 200 comes back as `- not verified (HTTP 404): <url>`.
- `agents/santa/AGENTS.md` is the agent's standing instruction (three steps).
- `make-config.mjs` writes the OpenClaw config.

### Nothing is hard-coded

The only static data is the list of storefront domains in `plugin/santa-shop/stores.js`. It is configuration, like the list of sites a search tool is allowed to query. **No product, price or link exists anywhere in this repo.** Every line of the answer comes from the retailer's live response during the run, so:

- results change when a store changes its catalog, stock or prices. A rerun proves the lookup is live; it is not expected to return the same five products forever;
- a store that is down shows up as `- search failed for <store>: ...`, and a link that cannot be confirmed as `- not verified (...)`. There is no fallback data;
- prices are shown as the storefront lists them. A product whose variants differ in price is shown as a range (for example `$139.00-$149.00`).

The wish-list prompt names a store and a search word per gift, the way a person hands over a shopping list. The plugin also works with an open prompt (`prompts/plain.txt` with the `shop` tool, which returns three candidates per store and lets Kimi choose stores, search words and products). That variant is slower because Kimi has more to decide and writes more of its own text; see the table below.

## Speed

TPS is measured by the official [OpenClaw speed patch](https://github.com/wkasekende/openclaw-speed-patch), unmodified. It reads Cerebras' own server-side timing for every model call (`usage.completion_tokens / time_info.completion_time`) and shows the mean over the calls of a response.

What we learned by measuring Kimi K3.1 Pro on Cerebras (scripts in `bench/`):

| Output kind | Typical server rate |
| --- | --- |
| Free prose, reasoning tokens | 230–310 tok/s |
| Tool call | 600–1,000 tok/s |
| Text copied verbatim from context | 850–1,300 tok/s |

The score is the plain average of the per-call rates, so the run is designed to spend its tokens where Kimi on Cerebras is fastest:

- **Almost no reasoning.** Reasoning cannot be switched off for this model (`low` is the lowest effort the API accepts) and reasoning tokens are the slowest ones: about 3.8 ms each against about 1.1 ms for a copied token. So the instruction is terse and the request leaves nothing to decide.
- **Tool calls copied from context.** Call 1 copies the wish-list items into five parallel `gift` calls; the parallel calls carry more fast tokens for the same handful of reasoning tokens than one batched call does. Call 2 copies the five product URLs into `verify` calls and usually needs no reasoning at all.
- **An answer copied from the verified results.** The tools return lines that are ready to show, and Kimi repeats them.

The link check is the step that makes the answer trustworthy, and it is also a fast call, so the three-call chain beats the two-call chain (search, answer) on the average.

Run-to-run noise is large (the same 147-token answer took between 96 and 190 ms of server decode time), and the service is slower when it is busy. Results by configuration, all through the patched OpenClaw Gateway:

| Configuration | Model calls | Runs | Median | Best |
| --- | --- | --- | --- | --- |
| Open prompt, `shop` tool, no instruction file | 2 | 1 | 561 | 561 |
| Wish list, `shop` tool (three candidates per store) | 2 | 8 | 702 | 1,096 |
| Wish list, `gifts` tool (one batched call) | 2 | 48 | 803 | 1,167 |
| Wish list, `gift` + `verify`, **this entry** (`santa` agent) | 3 | 16 | 935 | 1,273 |

In the head-to-head where the last two configurations alternated run by run, `santa` won 7 of 8 rounds (median 932 against 734).

### Reading the speed readout

The readout next to the message box covers the whole conversation. With one run in a fresh conversation it is the mean over that run's three model calls, and it matches the session history. That is the number we report.

Right after a live run, the badge under the response can show a different value: a turn with five parallel tool calls is displayed as five steps, and the badge counts that turn five times. Reload the page and both readouts agree.

### What we did not do

Calls cut off by a tiny `max_completion_tokens` report absurd rates (30,000+ tok/s) because all their tokens arrive in the first streamed burst. Such calls do no work, so this entry does not use them: `maxTokens` is 1024, far above the 160 to 290 tokens each of the three calls produces, and every call ends normally.

## Settings that differ from the patch's example config

The model, base URL, thinking level (`low`) and supported reasoning efforts are the ones from the patch's `dev/cerebras-kimi/openclaw.json`. Added in `make-config.mjs`:

| Setting | Why |
| --- | --- |
| `tools.toolSearch: false`, `tools.allow: ["gift", "verify"]` | Send the two tool schemas directly instead of hiding tools behind `tool_search`, which costs extra model calls |
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
source env.sh && node bench/oc-run.mjs --agent santa --prompt-file prompts/xmas.txt --n 10 && node bench/summary.mjs
```

Record an attempt in the web chat as a video:

```bash
node record/record.mjs --n 5 --expand-tool --height 1080
```

## Layout

| Path | What |
| --- | --- |
| `plugin/santa-shop/` | OpenClaw plugin: live storefront tools (`gift`, `verify`, `gifts`, `shop`) |
| `agents/` | Agent instruction files. `santa` is the entry; the others are variants compared during tuning (`node make-config.mjs --variants`) |
| `prompts/` | Prompts used in runs |
| `bench/` | Direct-API microbenchmarks and the OpenClaw run harness |
| `record/` | Automated recorder for the web chat demo video |
| `setup.sh`, `run-gateway.sh`, `env.sh`, `make-config.mjs` | Setup and run scripts |
