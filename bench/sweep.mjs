#!/usr/bin/env node
// Round-robin sweep: runs every case once per round so server-load drift is spread
// evenly across cases, with 429 backoff. Prints a per-case summary at the end.
// Usage: node bench/sweep.mjs <cases.json> --rounds N --out file.jsonl [--only substr]
import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runOnce } from "./direct.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : d);
const rounds = Number(opt("--rounds", "3"));
const out = resolve(opt("--out", "logs/sweep.jsonl"));
const only = opt("--only", "");
const gap = Number(opt("--gap", "300"));
mkdirSync(dirname(out), { recursive: true });
let cases = JSON.parse(readFileSync(args[0], "utf8"));
if (only) cases = cases.filter((c) => only.split(",").some((s) => c.name.includes(s)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const acc = new Map();
for (let round = 0; round < rounds; round++) {
  for (const c of cases) {
    let r;
    for (let attempt = 0; attempt < Number(opt("--attempts", "6")); attempt++) {
      r = await runOnce(c.body);
      if (r.ok || r.status !== 429) break;
      await sleep(Math.min(2000 * (attempt + 1), 6000));
    }
    appendFileSync(out, JSON.stringify({ at: new Date().toISOString(), name: c.name, round, ...r }) + "\n");
    if (r.ok && r.server_tps) {
      (acc.get(c.name) ?? acc.set(c.name, []).get(c.name)).push(r);
      console.log(`r${round} ${c.name.padEnd(28)} ${r.server_tps.toFixed(0).padStart(5)} tok/s  tok=${String(r.completion_tokens).padStart(5)} reason=${String(r.reasoning_tokens ?? "?").padStart(5)} ct=${r.time_info.completion_time.toFixed(3)}s finish=${r.finish} tools=${r.tool_calls.length}`);
    } else {
      console.log(`r${round} ${c.name.padEnd(28)} FAIL ${r.status ?? ""} ${(r.error ?? "no usage").replace(/\s+/g, " ").slice(0, 120)}`);
    }
    await sleep(gap);
  }
}
console.log("\n=== summary (server tok/s) ===");
for (const [name, rs] of acc) {
  const t = rs.map((r) => r.server_tps).sort((a, b) => a - b);
  const mean = t.reduce((a, b) => a + b, 0) / t.length;
  const med = t[Math.floor(t.length / 2)];
  const tok = Math.round(rs.reduce((a, r) => a + r.completion_tokens, 0) / rs.length);
  const rea = Math.round(rs.reduce((a, r) => a + (r.reasoning_tokens ?? 0), 0) / rs.length);
  console.log(`${name.padEnd(28)} n=${t.length} min=${t[0].toFixed(0)} med=${med.toFixed(0)} mean=${mean.toFixed(0)} max=${t.at(-1).toFixed(0)}  avgTok=${tok} avgReason=${rea}`);
}
