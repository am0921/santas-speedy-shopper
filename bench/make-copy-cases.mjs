// Builds direct-API cases that mirror the two kinds of model calls in the real run
// (tool-call turn, final-answer turn) using live search results, to learn which
// output shapes decode fastest. Research only.
import { writeFileSync } from "node:fs";
import { STORES } from "../plugin/santa-shop/stores.js";
import { formatProducts, searchStore } from "../plugin/santa-shop/search.js";

const picks = [["stanley", "holiday"], ["brooklinen", "robe"], ["leatherman", "multitool"], ["deathwish", "mug"], ["ugmonk", "desk"]];
const results = [];
for (const [s, q] of picks) results.push(formatProducts(await searchStore(s, q, 3)));

const storeList = Object.entries(STORES).map(([id, s]) => `${id} (${s.sells})`).join("; ");
const tools = [
  { type: "function", function: { name: "shop", description: `Search one real online store live and get in-stock products as "title | price | product page URL" lines. Stores: ${storeList}.`, parameters: { type: "object", properties: { store: { type: "string", enum: Object.keys(STORES) }, q: { type: "string", description: "Search word, e.g. robe" } }, required: ["store", "q"], additionalProperties: false } } },
];
const checkTool = { type: "function", function: { name: "check_links", description: "Verify that product page URLs are live. Returns HTTP status per URL.", parameters: { type: "object", properties: { urls: { type: "array", items: { type: "string" } } }, required: ["urls"] } } };
const user = "Find five Christmas gifts from real shopping websites. Give each product with its product page link.";
const calls = picks.map(([store, q], i) => ({ id: `call_${i}`, type: "function", function: { name: "shop", arguments: JSON.stringify({ store, q }) } }));
const afterTools = (sys) => [
  ...(sys ? [{ role: "system", content: sys }] : []),
  { role: "user", content: user },
  { role: "assistant", content: "", tool_calls: calls },
  ...results.map((text, i) => ({ role: "tool", tool_call_id: `call_${i}`, content: text })),
];
const base = { temperature: 1, reasoning_effort: "low", max_completion_tokens: 1024 };
const SYS = {
  none: null,
  lines: "Final answer format: exactly five lines, one product per store, each line copied verbatim from the tool output. No other text.",
  md: "Final answer format: exactly five lines, one product per store, each as `- [title](url) price` using the title, URL and price exactly as given by the tool. No other text.",
  terse: "Be terse. Do not deliberate. Final answer format: exactly five lines, one product per store, each line copied verbatim from the tool output. No other text.",
};
const cases = [];
for (const [k, sys] of Object.entries(SYS)) cases.push({ name: `final-${k}`, body: { ...base, messages: afterTools(sys), tools } });
cases.push({ name: "final-lines-t0", body: { ...base, temperature: 0, messages: afterTools(SYS.lines), tools } });
cases.push({ name: "final-lines-high", body: { ...base, reasoning_effort: "high", messages: afterTools(SYS.lines), tools } });
cases.push({ name: "final-lines-noeffort", body: { temperature: 1, max_completion_tokens: 1024, messages: afterTools(SYS.lines), tools } });
// Verbatim copy of everything (15 lines): the pure-copy ceiling.
cases.push({ name: "copy-all15", body: { ...base, messages: afterTools("Final answer: output every line of every tool result verbatim, in order. No other text."), tools } });
// Tool-call turns.
cases.push({ name: "turn1-plain", body: { ...base, messages: [{ role: "user", content: user }], tools } });
cases.push({ name: "turn1-directed", body: { ...base, messages: [{ role: "system", content: "Do not deliberate. Call shop for five different stores in one turn, then answer." }, { role: "user", content: user }], tools } });
cases.push({ name: "turn1-directed-t0", body: { ...base, temperature: 0, messages: [{ role: "system", content: "Do not deliberate. Call shop for five different stores in one turn, then answer." }, { role: "user", content: user }], tools } });
cases.push({ name: "verify-links", body: { ...base, messages: afterTools("After searching, pick one product per store and call check_links once with the five chosen product URLs before answering. Do not deliberate."), tools: [...tools, checkTool] } });
writeFileSync(new URL("./cases/copy.json", import.meta.url), JSON.stringify(cases, null, 1));
console.log(cases.length, "cases;", results.join("\n").length, "chars of tool output");
