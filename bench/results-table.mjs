#!/usr/bin/env node
// Prints the README results table from evidence/ (run bench/collect-evidence.mjs first).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ev = join(dirname(fileURLToPath(import.meta.url)), "..", "evidence");
const runs = readFileSync(join(ev, "gateway-runs.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const median = (v) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const fmt = (x) => Math.round(x).toLocaleString("en-US");
const distinct = (r) => new Set(r.links ?? []).size;
const clean = (r) => !/not verified|search failed|nothing found|needs a short break/.test(r.final ?? "");

// label prefix -> configuration; a run is complete when it has timing for the expected
// number of model calls and an answer with five distinct product links.
const groups = [
  ["Open prompt, `shop` tool, no instruction file", 2, (r) => r.label === "plain-shop"],
  ["Open prompt, `shop` tool, with an instruction file", 2, (r) => r.label === "agents-v1"],
  ["Wish list, `shop` tool (three candidates per store)", 2, (r) => /^(wishlist-v1|ab1-shop)$/.test(r.label)],
  ["Wish list, `gift` tool (five parallel calls, no link check)", 2, (r) => /^ab\d\w?-gift$/.test(r.label)],
  ["Wish list, `gifts` tool (one batched call, no link check)", 2, (r) => r.agent === "gifts" || /^(ab1-gifts|ab2[wl]-gifts|s1-gifts)$/.test(r.label)],
  ["Wish list, `gift` + `verify`, **this entry** (`santa` agent)", 3, (r) => r.agent === "santa"],
];
console.log("| Configuration | Model calls | Complete runs (of started) | Median | Best |");
console.log("| --- | --- | --- | --- | --- |");
// The very first logged run was read back with every call listed twice; count each call once.
const callCount = (r) => new Set((r.speed?.calls ?? []).map((c) => `${c.tokens}/${c.ms}`)).size;
for (const [name, calls, match] of groups) {
  const all = runs.filter(match);
  const ok = all.filter((r) => callCount(r) === calls && distinct(r) >= 5 && clean(r));
  const v = ok.map((r) => r.speed.mean);
  console.log(`| ${name} | ${calls} | ${ok.length} (of ${all.length}) | ${v.length ? fmt(median(v)) : "-"} | ${v.length ? fmt(Math.max(...v)) : "-"} |`);
}

// Head-to-head: santa and gifts alternated run by run.
const a = runs.filter((r) => r.label === "il1-santa").map((r) => r.speed?.mean);
const b = runs.filter((r) => r.label === "il1-gifts").map((r) => r.speed?.mean);
const rounds = Math.min(a.length, b.length);
let wins = 0;
for (let i = 0; i < rounds; i++) if (a[i] > b[i]) wins++;
console.log(`\nHead-to-head (alternating): santa won ${wins} of ${rounds} rounds, median ${fmt(median(a))} against ${fmt(median(b))}.`);

// Recorded web chat attempts.
const recDir = join(ev, "recorded");
if (existsSync(recDir)) {
  const rec = readdirSync(recDir).map((f) => JSON.parse(readFileSync(join(recDir, f), "utf8"))).filter((r) => r.agent === "santa");
  const score = (r) => r.calls.reduce((s, c) => s + c.tokens / (c.ms / 1000), 0) / r.calls.length;
  const ok = rec.filter((r) => r.calls?.length === 3 && new Set(r.links ?? []).size >= 5 && !/not verified|search failed|nothing found/.test(r.answerText ?? ""));
  const v = ok.map(score);
  const noRetry = ok.filter((r) => r.sawRetry === false).map(score);
  console.log(`\nRecorded web chat attempts (santa): ${ok.length} complete of ${rec.length} started, median ${fmt(median(v))}, best ${fmt(Math.max(...v))}; best without a provider retry on screen ${noRetry.length ? fmt(Math.max(...noRetry)) : "-"}.`);
  const tokens = ok.flatMap((r) => r.calls.map((c) => c.tokens));
  console.log(`Tokens per model call in those runs: ${Math.min(...tokens)} to ${Math.max(...tokens)}.`);
}
