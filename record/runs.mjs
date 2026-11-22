// Shared reading and scoring of recorded attempts (record/out/<dir>/result.json).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const outDir = new URL("./out/", import.meta.url).pathname;

/**
 * The run's score: the mean of its model calls' server rates, from the session history
 * (`calls`). This equals the readout next to the composer. Older result.json files stored
 * the per-response badge in `meanTps`, so the score is always recomputed here.
 */
export function score(r) {
  const calls = (r.calls ?? []).filter((c) => c.tokens >= 1 && c.ms > 0);
  if (!calls.length) return null;
  return calls.reduce((sum, c) => sum + c.tokens / (c.ms / 1000), 0) / calls.length;
}

/** A complete santa run: three model calls and five distinct product links, all link-checked. */
export function complete(r) {
  return (
    r.agent === "santa" &&
    r.calls?.length === 3 &&
    new Set(r.links ?? []).size >= 5 &&
    !/not verified|search failed|nothing found/.test(r.answerText ?? "")
  );
}

export function loadRuns() {
  return readdirSync(outDir)
    .filter((d) => existsSync(join(outDir, d, "result.json")))
    .map((d) => {
      const r = JSON.parse(readFileSync(join(outDir, d, "result.json"), "utf8"));
      return { d, r, tps: score(r), complete: complete(r), hasVideo: existsSync(join(outDir, d, "video.mp4")) };
    });
}
