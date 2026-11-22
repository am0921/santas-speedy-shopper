// Direct-API cases: how does the per-call rate behave for short, copy-only outputs with
// little or no reasoning? (echo N lines of tool output; tool call with 1..5 items)
import { writeFileSync } from "node:fs";
import { STORES } from "../plugin/santa-shop/stores.js";
import { formatProducts, searchStore } from "../plugin/santa-shop/search.js";

const picks = [["stanley", "tumbler"], ["brooklinen", "robe"], ["leatherman", "multitool"], ["deathwish", "mug"], ["puravida", "bracelet"]];
const lines = [];
for (const [s, q] of picks) lines.push(formatProducts(await searchStore(s, q, 1)));
const storeList = Object.entries(STORES).map(([id, s]) => `${id} (${s.sells})`).join("; ");
const gifts = { type: "function", function: { name: "gifts", description: `Find gifts at real online stores, live. Each item is "store word", e.g. "brooklinen robe". Returns the top in-stock product per item, one line each: "- title price URL". Stores: ${storeList}.`, parameters: { type: "object", properties: { items: { type: "array", items: { type: "string" } } }, required: ["items"], additionalProperties: false } } };
const names = ["a tumbler (stanley)", "a robe (brooklinen)", "a multitool (leatherman)", "a mug (deathwish)", "a bracelet (puravida)"];
const ask = (n) => `Find ${["one", "two", "three", "four", "five"][n - 1]} Christmas gift${n > 1 ? "s" : ""} from real shopping websites: ${names.slice(0, n).join(", ")}.`;
const base = { temperature: 1, reasoning_effort: "low", max_completion_tokens: 1024, tools: [gifts] };
const SYS = {
  terse: 'Be terse. Do not deliberate.\n1. Call `gifts` once with every requested item as "store word".\n2. Reply with the tool output only.',
  nothink: 'Never think or reason: your output starts directly with the action.\nRequest -> call `gifts` at once with every requested item as "store word".\nTool output -> reply with it verbatim, nothing else.',
  example: 'Request -> call `gifts` at once. Tool output -> reply with it verbatim, nothing else. No reasoning.\nExample: "a robe (brooklinen), a mug (deathwish)" -> gifts({"items":["brooklinen robe","deathwish mug"]})',
};
const cases = [];
for (const [k, sys] of Object.entries(SYS)) {
  for (const n of [1, 5]) {
    cases.push({ name: `call-${k}-${n}`, body: { ...base, messages: [{ role: "system", content: sys }, { role: "user", content: ask(n) }] } });
    cases.push({
      name: `echo-${k}-${n}`,
      body: {
        ...base,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: ask(n) },
          { role: "assistant", content: "", tool_calls: [{ id: "call_0", type: "function", function: { name: "gifts", arguments: JSON.stringify({ items: picks.slice(0, n).map((p) => p.join(" ")) }) } }] },
          { role: "tool", tool_call_id: "call_0", content: lines.slice(0, n).join("\n") },
        ],
      },
    });
  }
}
for (const n of [2, 3]) {
  cases.push({
    name: `echo-terse-${n}`,
    body: { ...base, messages: [{ role: "system", content: SYS.terse }, { role: "user", content: ask(n) }, { role: "assistant", content: "", tool_calls: [{ id: "call_0", type: "function", function: { name: "gifts", arguments: JSON.stringify({ items: picks.slice(0, n).map((p) => p.join(" ")) }) } }] }, { role: "tool", tool_call_id: "call_0", content: lines.slice(0, n).join("\n") }] },
  });
}
writeFileSync(new URL("./cases/short2.json", import.meta.url), JSON.stringify(cases, null, 1));
console.log(cases.length, "cases");
