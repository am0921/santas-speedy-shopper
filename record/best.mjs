#!/usr/bin/env node
// Lists the best recorded attempts: overall, and "clean" ones (three model calls, all five
// links verified, no provider-retry indicator on screen). Usage: node record/best.mjs [N=5]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const out = new URL("./out/", import.meta.url).pathname;
const n = Number(process.argv[2] ?? 5);
const runs = readdirSync(out)
  .filter((d) => existsSync(join(out, d, "result.json")))
  .map((d) => ({ d, r: JSON.parse(readFileSync(join(out, d, "result.json"), "utf8")) }))
  .filter(({ r }) => r.ok && r.agent === "santa" && r.calls?.length === 3 && !/not verified/.test(r.answerText ?? ""))
  .sort((a, b) => b.r.meanTps - a.r.meanTps);

const row = ({ d, r }) =>
  `${String(Math.round(r.meanTps)).padStart(5)} tok/s  calls ${r.calls.map((c) => c.tps).join(" / ")}  video ${Math.round(r.durationMs / 1000)}s  retry-on-screen ${r.sawRetry ?? "?"}  ${existsSync(join(out, d, "video.mp4")) ? "" : "(video pruned) "}record/out/${d}`;

const means = runs.map((x) => x.r.meanTps).sort((a, b) => a - b);
const median = means.length % 2 ? means[(means.length - 1) / 2] : (means[means.length / 2 - 1] + means[means.length / 2]) / 2;
console.log(`recorded santa runs (3 calls, 5 verified links): ${runs.length}, median ${Math.round(median)}, best ${Math.round(means.at(-1) ?? 0)}`);
console.log("\ntop overall:");
runs.slice(0, n).forEach((x) => console.log(row(x)));
console.log("\ntop without a provider retry on screen:");
runs.filter((x) => x.r.sawRetry === false).slice(0, n).forEach((x) => console.log(row(x)));
