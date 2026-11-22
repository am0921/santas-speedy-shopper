// Keeps the videos of the best N recorded attempts (by reported mean) and removes the
// video files of the others; result.json and final.png are kept for every attempt.
import { existsSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
const out = new URL("./out/", import.meta.url).pathname;
const keep = Number(process.argv[2] ?? 12);
const runs = readdirSync(out)
  .filter((d) => existsSync(join(out, d, "result.json")))
  .map((d) => ({ d, r: JSON.parse(readFileSync(join(out, d, "result.json"), "utf8")) }))
  .sort((a, b) => (b.r.ok ? b.r.meanTps : -1) - (a.r.ok ? a.r.meanTps : -1));
runs.slice(keep).forEach(({ d }) => {
  for (const f of ["video.mp4", "video.webm"]) if (existsSync(join(out, d, f))) unlinkSync(join(out, d, f));
});
const ok = runs.filter((x) => x.r.ok);
console.log(`attempts=${runs.length} ok=${ok.length} top: ${ok.slice(0, 5).map((x) => `${Math.round(x.r.meanTps)} (${x.d})`).join(", ")}`);
