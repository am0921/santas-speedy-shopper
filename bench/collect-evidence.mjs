#!/usr/bin/env node
// Copies the raw measurement data behind the README into evidence/ (local paths removed).
// Usage: node bench/collect-evidence.mjs
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "evidence");
const scrub = (text) => text.split(root).join(".");
const put = (from, to) => {
  if (!existsSync(join(root, from))) return false;
  mkdirSync(dirname(join(out, to)), { recursive: true });
  writeFileSync(join(out, to), scrub(readFileSync(join(root, from), "utf8")));
  return true;
};

// Scripted runs through the patched OpenClaw Gateway (bench/oc-run.mjs).
put("logs/oc-runs.jsonl", "gateway-runs.jsonl");

// Direct chat-completions microbenchmarks (bench/sweep.mjs, bench/direct.mjs).
const direct = {
  "logs/characterise-1.jsonl": "direct/characterise-1.jsonl",
  "logs/sweep-1.jsonl": "direct/output-length-and-effort.jsonl",
  "logs/sweep-short.jsonl": "direct/short-outputs.jsonl",
  "logs/sweep-short2.jsonl": "direct/echo-and-call-lengths.jsonl",
  "logs/sweep-copy.jsonl": "direct/copy-vs-prose.jsonl",
  "logs/sweep-args.jsonl": "direct/argument-shape.jsonl",
  "logs/sweep-think.jsonl": "direct/instruction-wording.jsonl",
  "logs/sweep-reason-off.jsonl": "direct/reasoning-off-attempts.jsonl",
  "logs/clock.jsonl": "direct/speed-by-time-of-day.jsonl",
  "lab/call1/r1.jsonl": "direct/chain-instruction-placement.jsonl",
  "lab/call1b/r1.jsonl": "direct/chain-first-call-wording-1.jsonl",
  "lab/call1b/r2.jsonl": "direct/chain-first-call-wording-2.jsonl",
  "lab/ideas-output/echo.jsonl": "direct/reasoning-cost-fit/echo.jsonl",
  "lab/ideas-output/call.jsonl": "direct/reasoning-cost-fit/call.jsonl",
  "lab/ideas-output/fit.mjs": "direct/reasoning-cost-fit/fit.mjs",
  "lab/ideas-structure/s1.jsonl": "direct/run-structure-1.jsonl",
  "lab/ideas-structure/s2.jsonl": "direct/run-structure-2.jsonl",
  "lab/ideas-structure/s3.jsonl": "direct/run-structure-3.jsonl",
  "lab/ideas-openclaw/shape1.jsonl": "direct/request-shaping-1.jsonl",
  "lab/ideas-openclaw/shape2.jsonl": "direct/request-shaping-2.jsonl",
};
let n = 1;
for (const [from, to] of Object.entries(direct)) if (put(from, to)) n++;

// Recorded web chat attempts (record/record.mjs): each attempt's result.json.
const rec = join(root, "record", "out");
let attempts = 0;
const kept = new Set();
for (const d of existsSync(rec) ? readdirSync(rec) : []) {
  const src = join(rec, d, "result.json");
  if (!existsSync(src)) continue;
  const r = JSON.parse(scrub(readFileSync(src, "utf8")));
  delete r.consoleErrors;
  // Folder names were tagged with whatever readout the recorder version used; key by start time.
  const id = String(r.startedAt ?? d).replace(/[:.]/g, "-");
  mkdirSync(join(out, "recorded"), { recursive: true });
  writeFileSync(join(out, "recorded", `${id}.json`), JSON.stringify({ ...r, recordDir: d }, null, 1) + "\n");
  kept.add(`${id}.json`);
  attempts++;
}
// Drop entries whose attempt folder no longer exists in record/out.
for (const f of existsSync(join(out, "recorded")) ? readdirSync(join(out, "recorded")) : []) {
  if (!kept.has(f)) unlinkSync(join(out, "recorded", f));
}
console.log(`evidence/: gateway-runs.jsonl, ${n - 1} direct files, ${attempts} recorded attempts`);
