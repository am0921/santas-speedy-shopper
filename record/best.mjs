#!/usr/bin/env node
// Lists the best recorded attempts: overall, and those without a provider-retry indicator
// on screen. Only complete santa runs count (three model calls, five link-checked products).
// Usage: node record/best.mjs [N=5]
import { loadRuns } from "./runs.mjs";

const n = Number(process.argv[2] ?? 5);
const all = loadRuns();
const runs = all.filter((x) => x.complete && x.tps != null).sort((a, b) => b.tps - a.tps);

const row = ({ d, r, tps, hasVideo }) =>
  `${String(Math.round(tps)).padStart(5)} tok/s  calls ${r.calls.map((c) => c.tps).join(" / ")}  video ${Math.round(r.durationMs / 1000)}s  retry-on-screen ${r.sawRetry ?? "?"}  ${hasVideo ? "" : "(video pruned) "}record/out/${d}`;

const means = runs.map((x) => x.tps).sort((a, b) => a - b);
const median = means.length % 2 ? means[(means.length - 1) / 2] : (means[means.length / 2 - 1] + means[means.length / 2]) / 2;
console.log(
  `recorded attempts: ${all.length}; complete santa runs (3 calls, 5 link-checked products): ${runs.length}, median ${Math.round(median ?? 0)}, best ${Math.round(means.at(-1) ?? 0)}`,
);
console.log("\ntop overall:");
runs.slice(0, n).forEach((x) => console.log(row(x)));
console.log("\ntop without a provider retry on screen:");
runs.filter((x) => x.r.sawRetry === false).slice(0, n).forEach((x) => console.log(row(x)));
