// Logs how fast the two kinds of calls in our run decode over the day (direct API, small):
// every INTERVAL minutes, 3x tool-call turn + 3x echo turn. Output: logs/clock.jsonl
import { appendFileSync, readFileSync } from "node:fs";
import { runOnce } from "./direct.mjs";
const args = JSON.parse(readFileSync(new URL("./cases/args.json", import.meta.url), "utf8")).find((c) => c.name === "args-str");
const echo = JSON.parse(readFileSync(new URL("./cases/short2.json", import.meta.url), "utf8")).find((c) => c.name === "echo-terse-5");
const intervalMin = Number(process.argv[2] ?? 5);
const hours = Number(process.argv[3] ?? 12);
const end = Date.now() + hours * 3600_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
while (Date.now() < end) {
  const row = { at: new Date().toISOString(), call: [], echo: [], queue: [] };
  for (let i = 0; i < 3; i++) {
    for (const [k, c] of [["call", args], ["echo", echo]]) {
      let r;
      for (let a = 0; a < 8; a++) {
        r = await runOnce(c.body);
        if (r.ok) break;
        await sleep(3000);
      }
      if (r.ok && r.server_tps) {
        row[k].push(Math.round(r.server_tps));
        row.queue.push(+r.time_info.queue_time.toFixed(2));
      }
    }
  }
  appendFileSync(new URL("../logs/clock.jsonl", import.meta.url), JSON.stringify(row) + "\n");
  await sleep(intervalMin * 60_000);
}
