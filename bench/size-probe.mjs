// Does queue admission (HTTP 429 queue_exceeded) depend on prompt size? Interleaves small and large prompts.
import { runOnce } from "./direct.mjs";
const filler = Array.from({ length: 900 }, (_, i) => `Note ${i}: the workshop elves keep a ledger of sleigh parts, ribbon stock and cocoa rations.`).join("\n");
const small = { messages: [{ role: "user", content: "Reply with exactly: OK" }], reasoning_effort: "low", max_completion_tokens: 256 };
const large = { messages: [{ role: "system", content: filler }, { role: "user", content: "Reply with exactly: OK" }], reasoning_effort: "low", max_completion_tokens: 256 };
const tally = { small: [0, 0], large: [0, 0] };
for (let i = 0; i < Number(process.argv[2] ?? 8); i++) {
  for (const [name, body] of [["small", small], ["large", large]]) {
    const r = await runOnce(body);
    tally[name][r.ok ? 0 : 1]++;
    console.log(name, r.ok ? `ok ${r.server_tps?.toFixed(0)}tps tok=${r.completion_tokens} r=${r.reasoning_tokens} ct=${(r.time_info.completion_time * 1000).toFixed(1)}ms prompt=${r.prompt_tokens} cached=${r.cached_tokens} queue=${r.time_info.queue_time.toFixed(3)}` : `FAIL ${r.status} ${r.error.replace(/\s+/g, " ").slice(0, 100)}`);
    await new Promise((res) => setTimeout(res, 400));
  }
}
console.log(JSON.stringify(tally));
