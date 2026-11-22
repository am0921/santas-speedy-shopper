// Compares agent variants over recorded web chat attempts started after --since (ISO time).
// Usage: node record/compare.mjs --since 2026-11-22T07:50:00Z agent1 agent2 ...
import { loadRuns } from "./runs.mjs";
const args = process.argv.slice(2);
const since = args.includes("--since") ? args[args.indexOf("--since") + 1] : "";
const agents = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--since");
const med = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
const runs = loadRuns().filter((x) => (!since || x.r.startedAt >= since) && agents.includes(x.r.agent));
for (const a of agents) {
  const all = runs.filter((x) => x.r.agent === a);
  const ok = all.filter((x) => x.r.calls?.length === 3 && new Set(x.r.links ?? []).size >= 5 && !/not verified|search failed/.test(x.r.answerText ?? ""));
  const c = (i, f) => Math.round(med(ok.map((x) => x.r.calls[i][f])));
  console.log(`${a.padEnd(8)} complete ${ok.length}/${all.length}  run median ${Math.round(med(ok.map((x) => x.tps)))}  best ${Math.round(Math.max(0, ...ok.map((x) => x.tps)))}  | call1 ${c(0, "tps")} (${c(0, "tokens")}t)  call2 ${c(1, "tps")} (${c(1, "tokens")}t)  call3 ${c(2, "tps")} (${c(2, "tokens")}t)`);
}
