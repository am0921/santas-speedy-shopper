// Keeps the videos of the best N complete attempts overall plus the best N without a
// provider retry on screen, and removes the video files of the others. result.json and
// final.png are kept for every attempt. Usage: node record/prune.mjs [N=12]
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { loadRuns, outDir } from "./runs.mjs";

const keep = Number(process.argv[2] ?? 12);
const runs = loadRuns();
const ranked = runs.filter((x) => x.complete && x.tps != null).sort((a, b) => b.tps - a.tps);
const keepers = new Set([
  ...ranked.slice(0, keep).map((x) => x.d),
  ...ranked.filter((x) => x.r.sawRetry === false).slice(0, keep).map((x) => x.d),
]);
for (const { d } of runs) {
  if (keepers.has(d)) continue;
  for (const f of ["video.mp4", "video.webm"]) if (existsSync(join(outDir, d, f))) unlinkSync(join(outDir, d, f));
}
const clean = ranked.filter((x) => x.r.sawRetry === false);
console.log(
  `attempts=${runs.length} complete=${ranked.length} top: ${ranked.slice(0, 4).map((x) => Math.round(x.tps)).join(", ")} | no retry on screen: ${clean.length}, top: ${clean.slice(0, 4).map((x) => Math.round(x.tps)).join(", ")}`,
);
