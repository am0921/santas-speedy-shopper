#!/usr/bin/env node
// Writes state/openclaw.json for this project. All knobs are plain OpenClaw config;
// nothing here touches the speed patch or the measurement path.
//
// Usage: node make-config.mjs [--variants] [--thinking low|high|max] [--max-tokens N]
//                             [--temperature T] [--extra '{"k":"v"}']
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const flag = (n) => args.includes(n);

const MODEL = "moonshotai-kimi-k3.1-pro-trial";
const thinking = opt("--thinking", "low");
const maxTokens = Number(opt("--max-tokens", "1024"));
const temperature = opt("--temperature", null);
const extra = opt("--extra", null);
const inject = opt("--inject", "always"); // always | never: whether workspace AGENTS.md goes into the prompt

// The entry is the "santa" agent: search (gift) -> check each link (verify) -> answer.
// --variants adds the agent variants that were compared during tuning; each has its own
// AGENTS.md under agents/<id>/ and its own tool set.
const VARIANTS = flag("--variants")
  ? { santa: ["gift", "verify"], santa2: ["gift", "verify"], santa3: ["gift", "verify"], santa4: ["gift", "verify"], gifts: ["gifts"], gift: ["gift"], shop: ["shop"], "gifts-bare": ["gifts"] }
  : { santa: ["gift", "verify"] };
const tools = [...new Set(Object.values(VARIANTS).flat())];
const params = {};
if (temperature != null) params.temperature = Number(temperature);
if (extra) params.extra_body = JSON.parse(extra);

const config = {
  gateway: { mode: "local", port: 19789, bind: "loopback", auth: { mode: "token" } },
  agents: {
    ...(Object.keys(VARIANTS).length > 1 ? { ownership: "explicit" } : {}),
    defaults: {
      workspace: join(root, "agents", "santa"),
      model: { primary: `cerebras/${MODEL}` },
      models: { [`cerebras/${MODEL}`]: { params } },
      thinkingDefault: thinking,
      // Keep the run to the model calls the task needs: no bootstrap ritual, only the
      // agent's AGENTS.md in the prompt, no skills directory, no heartbeat turns,
      // no utility (title/narration) completions competing for the trial quota.
      skipBootstrap: true,
      contextInjection: inject,
      skills: [],
      heartbeat: { every: "0m" },
      utilityModel: "",
    },
    entries: Object.fromEntries(
      Object.entries(VARIANTS).map(([id, tool]) => [
        id,
        { workspace: join(root, "agents", id), tools: { allow: tool } },
      ]),
    ),
  },
  tools: {
    // Send tool schemas directly instead of hiding them behind tool_search.
    toolSearch: false,
    allow: tools,
  },
  // No autonomous background model calls (skill learning) during measured runs.
  skills: { workshop: { autonomous: { mode: "off" } } },
  plugins: {
    allow: ["santa-shop", "cerebras"],
    load: { paths: [join(root, "plugin", "santa-shop")] },
    entries: { "santa-shop": { enabled: true } },
  },
  models: {
    mode: "merge",
    providers: {
      cerebras: {
        baseUrl: "https://api.cerebras.ai/v1",
        api: "openai-completions",
        apiKey: "${CEREBRAS_API_KEY}",
        models: [
          {
            id: MODEL,
            name: "Kimi K3.1 Pro (Cerebras)",
            reasoning: true,
            input: ["text", "image"],
            maxTokens,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            compat: {
              supportsTools: true,
              supportsStrictMode: false,
              supportsReasoningEffort: true,
              supportedReasoningEfforts: ["low", "high", "max"],
            },
          },
        ],
      },
    },
  },
};

const out = join(root, "state", "openclaw.json");
writeFileSync(out, JSON.stringify(config, null, 2) + "\n");
console.log(`wrote ${out}: agents=${Object.keys(VARIANTS).join(",")} inject=${inject} thinking=${thinking} maxTokens=${maxTokens} params=${JSON.stringify(params)}`);
