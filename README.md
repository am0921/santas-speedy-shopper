# Santa's Speedy Shopper

Speed Bounty entry for the Cerebras × Moonshot AI Kimi K3.1 Pro × OpenClaw hackathon.

Santa gets a wish list. An OpenClaw agent running **Kimi K3.1 Pro on Cerebras** shops it live on real online stores, checks with a live request that every product link answers, and replies with five real products and their links. Making a list, checking it twice, in three model calls.

## How it works

```
user:   Find five Christmas gifts from real shopping websites:
        puravida christmas, colourpop holiday, leatherman wave, brooklinen robe, stanley tumbler.

call 1: Kimi calls   gift({"item": "puravida christmas"})  ... five calls in one turn
tools:  five live storefront searches, top in-stock hit per store
call 2: Kimi calls   verify({"url": "https://www.puravidabracelets.com/products/..."})  ... five calls in one turn
tools:  one live HEAD request per product URL; a link counts only if the store answers 2xx with a product page
call 3: Kimi answers with the five link-checked products: title and price from the live search, plus the product page URL
```

- `plugin/santa-shop/` is an OpenClaw plugin with the tools. `gift` queries a retailer's public storefront search endpoint (`/search/suggest.json`) at call time. `verify` asks the store for the product page itself and reports what it got: a link that does not answer comes back as `- not verified (HTTP 404): <url>`.
- `agents/santa/AGENTS.md` is the agent's standing instruction (three steps).
- `make-config.mjs` writes the OpenClaw config.

### Nothing is hard-coded

The only static data the entry uses is the list of storefront domains in `plugin/santa-shop/stores.js`. It is configuration, like the list of sites a search tool is allowed to query. **The plugin, the agent and the prompt contain no product, price or link.** Every line of the answer comes from the retailer's live response during the run, so:

- results change when a store changes its catalog, stock or prices. A rerun shows that the lookup is live; it is not expected to return the same five products forever. During our own testing one price changed from $8.00 to $4.80 between runs;
- a store that is down shows up as `- search failed for <store>: ...`, and a link that cannot be confirmed as `- not verified (...)`. There is no fallback data;
- prices are the storefront's own listed USD prices. A product whose variants differ in price is shown as a range (for example `$139.00-$149.00`).

`bench/cases/*.json` and `evidence/` are measurement inputs and logs. Some of them contain product lines captured from live searches during tuning. Nothing in the OpenClaw run reads them.

The wish-list prompt names a store and a search word per gift, the way a person hands over a shopping list. The plugin also works with an open prompt (`prompts/plain.txt` with the `shop` tool, which returns three candidates per store and lets Kimi choose stores, search words and products). That variant is slower because Kimi has more to decide and writes more of its own text; see the table below.

## Speed

TPS is measured by the official [OpenClaw speed patch](https://github.com/wkasekende/openclaw-speed-patch), unmodified (patch repository commit `e40e9f7`). It reads Cerebras' own server-side timing for every model call (`usage.completion_tokens / time_info.completion_time`) and shows the mean over the calls of a response.

What we learned by measuring Kimi K3.1 Pro on Cerebras (scripts in `bench/`, raw data in `evidence/direct/`):

| Output kind | Typical server rate |
| --- | --- |
| Free prose, reasoning tokens | 230–310 tok/s |
| Tool call | 600–1,000 tok/s |
| Text copied verbatim from context | 850–1,300 tok/s |

The score is the plain average of the per-call rates, so the run is designed to spend its tokens where Kimi on Cerebras is fastest:

- **Almost no reasoning.** Reasoning cannot be switched off for this model (`low` is the lowest effort the API accepts) and reasoning tokens are the slowest ones: in a linear fit of server decode time over 126 direct-API calls, about 3.8 ms per reasoning token against about 1.1 ms per visible token. So the instruction is terse and the request leaves nothing to decide.
- **Nothing after the tool results.** With token auth, the web chat appends a user-role "OpenClaw runtime context" message (the signed-in operator's profile) after the tool results of every call. Kimi then spends reasoning on whether that message needs an answer: the final call had a median of 185 tokens with it (104 recorded runs) against 165 without it (6 runs). `gateway.auth.mode: "none"` on a loopback-only Gateway leaves that message out. We found this by logging the request bodies once through a local debugging proxy; no measured run goes through a proxy.
- **Tool calls copied from context.** Call 1 copies the wish-list items into five parallel `gift` calls; the parallel calls carry more fast tokens for the same handful of reasoning tokens than one batched call does. Call 2 copies the five product URLs into `verify` calls and usually needs no reasoning at all.
- **An answer copied from the checked results.** The tools return lines that are ready to show, and Kimi repeats them.

The link check makes the answer more trustworthy, and it is also a fast call, so the three-call chain beats the batched two-call chain (search, answer) on the average.

Run-to-run noise is large (the same 147-token answer took between 96 and 190 ms of server decode time), and the service is slower when it is busy. Scripted runs by configuration, all through the patched OpenClaw Gateway (`evidence/gateway-runs.jsonl`; print this table with `node bench/results-table.mjs`):

<!-- table:start -->
| Configuration | Model calls | Complete runs (of started) | Median | Best |
| --- | --- | --- | --- | --- |
| Open prompt, `shop` tool, no instruction file | 2 | 1 (of 2) | 561 | 561 |
| Open prompt, `shop` tool, with an instruction file | 2 | 2 (of 3) | 857 | 1,027 |
| Wish list, `shop` tool (three candidates per store) | 2 | 8 (of 8) | 702 | 1,096 |
| Wish list, `gift` tool (five parallel calls, no link check) | 2 | 16 (of 16) | 843 | 1,132 |
| Wish list, `gifts` tool (one batched call, no link check) | 2 | 48 (of 59) | 803 | 1,167 |
| Wish list, `gift` + `verify`, **this entry** (`santa` agent) | 3 | 19 (of 21) | 934 | 1,273 |
<!-- table:end -->

A run is complete when it returned five distinct product links with timing for every model call. Runs that did not, almost always because the provider answered 429 while the service was congested, are counted as started and left out of the median. The rows were not all run on the same wish list or at the same time; the like-for-like comparison is the head-to-head where `santa` and `gifts` alternated run by run: <!-- h2h:start -->`santa` won 7 of 8 rounds (median 932 against 734).<!-- h2h:end -->

### The demo video is the best of many attempts

The bounty asks for the top TPS achieved, so the video is the best of the recorded web chat attempts, not a typical one. `record/loop.sh` records batches whenever the endpoint is not congested, one attempt at a time, each in a fresh conversation; `node record/best.mjs` lists them. <!-- recorded:start -->Across 185 complete recorded attempts (of 237 started) the median is 939 and the best is 1,316 tok/s; the best without a provider retry visible on screen is 1,221.<!-- recorded:end --> The per-attempt data is in `evidence/recorded/`; each attempt records the auth mode it ran with (attempts without an `authMode` field were made with token auth, before we found the context message; the best run is one of those).

### Reading the speed readout

The readout next to the message box covers the whole conversation. With one run in a fresh conversation it is the mean over that run's three model calls, and it matches the session history. That is the number we report.

Right after a live run, the badge under the response can show a different value. While streaming, a turn with five parallel tool calls is shown as several steps (three to five in our recordings), and the badge counts that turn's rate once per step, so it averages 8 to 11 entries instead of 3. Depending on which call is repeated, it can read higher or lower than the true mean. Reload the page and the badge is computed from the session history and agrees with the readout next to the message box.

### What we did not do

Calls cut off by a tiny `max_completion_tokens` report absurd rates (30,000+ tok/s) because all their tokens arrive in the first streamed burst. Such calls do no work, so this entry does not use them: `maxTokens` is 1024, far above the roughly 160 to 320 tokens each of the three calls produces, and every call ends normally.

## Settings that differ from the patch's example config

The model, base URL, thinking level (`low`) and supported reasoning efforts are the ones from the patch's `dev/cerebras-kimi/openclaw.json`. Added in `make-config.mjs`:

| Setting | Why |
| --- | --- |
| `tools.toolSearch: false`, `tools.allow: ["gift", "verify"]` | Send the two tool schemas directly instead of hiding tools behind `tool_search`, which costs extra model calls |
| `agents.entries.santa.workspace`, `contextInjection: "always"` | The instruction file `agents/santa/AGENTS.md` goes into the prompt |
| `agents.defaults.skipBootstrap`, `skills: []` | No first-run ritual and no skills directory in the prompt |
| `heartbeat.every: "0m"`, `utilityModel: ""`, `skills.workshop.autonomous.mode: "off"` | No background model calls during a run |
| `maxTokens: 1024` | Plenty for the answer; smaller reservation against the per-minute token limit |
| `plugins.load.paths`, `plugins.allow` | Loads `plugin/santa-shop`; only it and the Cerebras provider plugin are allowed |
| `gateway` (port 19789, loopback only), `gateway.auth.mode: "none"` | A local Gateway with its own state directory. Without auth the web chat does not attach the operator-profile message described below |

Nothing in OpenClaw itself is modified. `openclaw/` is commit `8b18b55` plus the two commits of the official patch; `setup.sh` checks the patch file's checksum and that the checkout is exactly that.

## Reproduce

Requirements:

- macOS or Linux with zsh, git, openssl and about 4 GB of free disk;
- Node 24.22.1 or later in the 24.x line (or 26.12.1+), with corepack. If [mise](https://mise.jdx.dev) is installed, `setup.sh` installs and uses Node 24.22.3 by itself;
- a Cerebras API key with access to `moonshotai-kimi-k3.1-pro-trial`;
- for the video recorder only: Google Chrome and ffmpeg.

```bash
./setup.sh          # official patch + OpenClaw 8b18b55, build, isolated state in ./state
```

Put your key in `.env` (`CEREBRAS_API_KEY=...`), then start the Gateway. It runs in the foreground and needs port 19789 free; stop it with Ctrl-C or `./stop-gateway.sh`.

```bash
./run-gateway.sh    # Gateway + web chat on http://127.0.0.1:19789
```

Then open http://127.0.0.1:19789/ in a browser. The Gateway listens on loopback only and is configured without auth; if you prefer the local access token, run `node make-config.mjs --auth token`, restart the Gateway and use the URL that `./open-ui.sh` prints (the readout then includes the extra context message, so expect slightly lower numbers).

In the web chat, start a new conversation (`santa` is the only configured agent) and send the prompt in `prompts/xmas.txt`. Read the tok/s value next to the message box: with one run in a fresh conversation it is that run's mean, the number we report. Use a fresh conversation per attempt. All OpenClaw state stays in `./state`; nothing is written to `~/.openclaw`. If you move the folder, run `node make-config.mjs` again, because the config holds absolute paths to the plugin and the agent folder.

Scripted runs, with per-call timing read back from the session history (the same `serverGeneration` values the readout aggregates). `env.sh` is a zsh file:

```bash
zsh -c 'source ./env.sh && node bench/oc-run.mjs --prompt-file prompts/xmas.txt --n 10 && node bench/summary.mjs'
```

Record attempts in the web chat as videos:

```bash
node record/record.mjs --n 5 --expand-tool --height 1080
```

Run attempts one at a time. Two runs at the same moment send ten product-page requests at once, and stores answer bursts like that with 429; the answer then honestly says `not verified`.

## Layout

| Path | What |
| --- | --- |
| `plugin/santa-shop/` | OpenClaw plugin: live storefront tools (`gift`, `verify`, `gifts`, `shop`) |
| `agents/` | Agent instruction files. `santa` is the entry; the others are variants compared during tuning (`node make-config.mjs --variants`) |
| `prompts/` | Prompts used in runs |
| `bench/` | Direct-API microbenchmarks and the OpenClaw run harness |
| `record/` | Automated recorder for the web chat demo video |
| `evidence/` | Raw data behind the numbers above: scripted Gateway runs, direct-API sweeps, recorded attempts |
| `setup.sh`, `run-gateway.sh`, `env.sh`, `make-config.mjs` | Setup and run scripts |
