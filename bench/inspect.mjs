// Prints per-call detail (reasoning text, output size, server timing) for the last N runs in logs/oc-runs.jsonl.
import { readFileSync } from "node:fs";
const n = Number(process.argv[2] ?? 3);
const filter = process.argv[3] ?? "";
const runs = readFileSync(new URL("../logs/oc-runs.jsonl", import.meta.url), "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.label.includes(filter)).slice(-n);
const port = process.env.OPENCLAW_GATEWAY_PORT ?? "19789";
for (const run of runs) {
  const res = await fetch(`http://127.0.0.1:${port}/sessions/${encodeURIComponent(run.sessionKey)}/history?limit=200`, { headers: { authorization: `Bearer ${process.env.OPENCLAW_GATEWAY_TOKEN}` } });
  const { messages = [] } = await res.json();
  console.log(`\n== ${run.sessionKey}`);
  for (const m of messages.filter((m) => m.role === "assistant")) {
    const parts = Array.isArray(m.content) ? m.content : [];
    const thinking = parts.filter((p) => p.type === "thinking").map((p) => p.thinking).join(" ");
    const text = parts.filter((p) => p.type === "text").map((p) => p.text).join("");
    const tcs = parts.filter((p) => p.type === "toolCall");
    const g = m.serverGeneration;
    console.log(`  ${g ? Math.round(g.outputTokens / (g.completionMs / 1000)) : "?"} tok/s  ${g?.outputTokens}t / ${g?.completionMs.toFixed(0)}ms  toolCalls=${tcs.length} textChars=${text.length} thinkingChars=${thinking.length}  in=${m.usage?.input} cacheRead=${m.usage?.cacheRead}`);
    console.log(`     thinking: ${JSON.stringify(thinking.slice(0, 420))}`);
  }
}
