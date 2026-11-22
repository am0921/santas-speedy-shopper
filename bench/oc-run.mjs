#!/usr/bin/env node
// Runs the task through the patched OpenClaw Gateway (fresh session each time) and
// reads back each model call's server timing from the session history: the same
// `serverGeneration` values the speed patch's UI badge aggregates.
//
// Usage: node bench/oc-run.mjs --prompt-file prompts/x.txt [--n 3] [--label name] [--thinking low]
// Requires env.sh to be sourced (OPENCLAW_* and CEREBRAS_API_KEY) and the gateway running.
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const promptFile = opt("--prompt-file");
const n = Number(opt("--n", "1"));
const label = opt("--label", "run");
const thinking = opt("--thinking", null);
const agent = opt("--agent", "santa");
const port = process.env.OPENCLAW_GATEWAY_PORT ?? "19789";
const token = process.env.OPENCLAW_GATEWAY_TOKEN;
const out = join(root, "logs", "oc-runs.jsonl");
mkdirSync(dirname(out), { recursive: true });
if (!promptFile || !token) {
  console.error("need --prompt-file and a sourced env.sh");
  process.exit(2);
}
const prompt = readFileSync(promptFile, "utf8").trim();

function textOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((c) => c?.type === "text").map((c) => c.text).join("");
}

async function history(sessionKey) {
  const res = await fetch(
    `http://127.0.0.1:${port}/sessions/${encodeURIComponent(sessionKey)}/history?limit=200`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`history HTTP ${res.status}`);
  const json = await res.json();
  return json.messages ?? json.items ?? [];
}

/** Same aggregation as ui/src/pages/chat/chat-generation-speed.ts in the speed patch. */
function speed(messages) {
  const calls = messages
    .filter((m) => m.role === "assistant" && m.serverGeneration)
    .map((m) => m.serverGeneration)
    .filter((s) => s.completionMs > 0 && s.outputTokens >= 1);
  if (!calls.length) return null;
  const rates = calls.map((c) => c.outputTokens / (c.completionMs / 1000));
  const sorted = rates.toSorted((a, b) => a - b);
  return {
    mean: rates.reduce((a, b) => a + b, 0) / rates.length,
    p90: sorted[Math.max(0, Math.ceil(0.9 * sorted.length) - 1)],
    calls: calls.map((c, i) => ({ tokens: c.outputTokens, ms: +c.completionMs.toFixed(2), tps: Math.round(rates[i]) })),
  };
}

for (let i = 0; i < n; i++) {
  const sessionKey = `agent:${agent}:${label}-${Date.now().toString(36)}-${i}`;
  const cli = ["openclaw/openclaw.mjs", "agent", "--agent", agent, "--session-key", sessionKey, "--message", prompt, "--json", "--timeout", "240"];
  if (thinking) cli.push("--thinking", thinking);
  const t0 = Date.now();
  const r = spawnSync("node", cli, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const wallMs = Date.now() - t0;
  let ok = true;
  let msgs = [];
  // The CLI can return a moment before the last assistant message is readable; poll briefly.
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      msgs = await history(sessionKey);
    } catch (e) {
      ok = false;
    }
    const last = msgs.at(-1);
    if (last?.role === "assistant" && last.serverGeneration && textOf(last.content)) break;
    await new Promise((res) => setTimeout(res, 500));
  }
  const s = speed(msgs);
  const assistant = msgs.filter((m) => m.role === "assistant");
  const final = textOf(assistant.at(-1)?.content ?? "");
  const toolCalls = assistant.flatMap((m) =>
    (Array.isArray(m.content) ? m.content : []).filter((c) => c?.type === "toolCall" || c?.type === "tool_use").map((c) => `${c.name}(${JSON.stringify(c.arguments ?? c.input ?? {})})`),
  );
  const links = [...final.matchAll(/https?:\/\/[^\s)>\]]+/g)].map((m) => m[0]);
  // ok = the run produced server timing and an answer with links; cliExit is the CLI process exit code.
  const rec = { at: new Date().toISOString(), label, agent, sessionKey, ok: ok && !!s && links.length > 0, cliExit: r.status, wallMs, speed: s, toolCalls, links, final };
  appendFileSync(out, JSON.stringify(rec) + "\n");
  if (!s) {
    const err = (r.stdout + r.stderr).replace(/\s+/g, " ").slice(-220);
    console.log(`${label}#${i} FAILED (${wallMs}ms) ${err}`);
    continue;
  }
  console.log(
    `${label}#${i} mean=${s.mean.toFixed(0)} p90=${s.p90.toFixed(0)} calls=[${s.calls.map((c) => `${c.tps}(${c.tokens}t/${c.ms}ms)`).join(", ")}] links=${links.length} tools=${toolCalls.length} wall=${wallMs}ms`,
  );
}
