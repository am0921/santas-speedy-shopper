// Waits until the Cerebras endpoint admits requests without queueing (two calm probes in a row).
// Usage: node bench/wait-ready.mjs [maxMinutes=20] [maxQueueSeconds=1]
import { runOnce } from "./direct.mjs";
const maxMin = Number(process.argv[2] ?? 20);
const maxQueue = Number(process.argv[3] ?? 1);
const body = { messages: [{ role: "user", content: "Reply with exactly: OK" }], reasoning_effort: "low", max_completion_tokens: 256 };
const end = Date.now() + maxMin * 60_000;
let calm = 0;
while (Date.now() < end) {
  const r = await runOnce(body).catch((e) => ({ ok: false, status: e.message }));
  const q = r.ok ? (r.time_info?.queue_time ?? Infinity) : null;
  calm = r.ok && q <= maxQueue ? calm + 1 : 0;
  console.log(new Date().toLocaleTimeString("ja-JP"), r.ok ? `ok queue=${q.toFixed(2)}s` : `HTTP ${r.status}`, `calm=${calm}`);
  if (calm >= 2) process.exit(0);
  await new Promise((res) => setTimeout(res, calm ? 2000 : 10_000));
}
process.exit(1);
