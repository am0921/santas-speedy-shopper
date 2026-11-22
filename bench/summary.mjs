#!/usr/bin/env node
// Summarises runs in logs/oc-runs.jsonl by label: distribution of the per-run mean
// (the number the speed patch shows) and of each call's rate.
// Usage: node bench/summary.mjs [label-substring] [--since ISO]
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const filter = args.find((a) => !a.startsWith("--")) ?? "";
const since = args.includes("--since") ? args[args.indexOf("--since") + 1] : "";
const rows = readFileSync(new URL("../logs/oc-runs.jsonl", import.meta.url), "utf8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l))
  .filter((r) => r.label.includes(filter) && (!since || r.at >= since));

const q = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
const stats = (xs) => {
  const s = xs.toSorted((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return `n=${s.length} min=${s[0].toFixed(0)} p25=${q(s, 0.25).toFixed(0)} median=${(s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2).toFixed(0)} mean=${mean.toFixed(0)} p75=${q(s, 0.75).toFixed(0)} p90=${q(s, 0.9).toFixed(0)} max=${s.at(-1).toFixed(0)}`;
};

const byLabel = new Map();
for (const r of rows) (byLabel.get(r.label) ?? byLabel.set(r.label, []).get(r.label)).push(r);
for (const [label, rs] of byLabel) {
  const good = rs.filter((r) => r.speed && new Set(r.links ?? []).size >= 5 && !/not verified|search failed/.test(r.final ?? ""));
  console.log(`\n${label}: ${rs.length} runs, ${good.length} complete (five distinct links, none unverified), ${rs.length - good.length} failed/incomplete`);
  if (!good.length) continue;
  const calls = good.map((r) => r.speed.calls.length);
  console.log(`  model calls per run: ${[...new Set(calls)].sort().map((c) => `${c}x${calls.filter((x) => x === c).length}`).join(" ")}`);
  console.log(`  run mean : ${stats(good.map((r) => r.speed.mean))}`);
  const first = good.map((r) => r.speed.calls[0].tps);
  const last = good.map((r) => r.speed.calls.at(-1).tps);
  console.log(`  call 1   : ${stats(first)}  (avg ${Math.round(good.reduce((a, r) => a + r.speed.calls[0].tokens, 0) / good.length)} tok)`);
  console.log(`  last call: ${stats(last)}  (avg ${Math.round(good.reduce((a, r) => a + r.speed.calls.at(-1).tokens, 0) / good.length)} tok)`);
  const best = good.toSorted((a, b) => b.speed.mean - a.speed.mean)[0];
  console.log(`  best run : ${best.speed.mean.toFixed(0)} at ${best.at}  ${best.sessionKey}`);
}
