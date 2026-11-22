// Direct-API cases: which instruction wording keeps the tool-call turn's reasoning shortest?
import { writeFileSync } from "node:fs";
import { STORES } from "../plugin/santa-shop/stores.js";
const storeList = Object.entries(STORES).map(([id, s]) => `${id} (${s.sells})`).join("; ");
const gifts = { type: "function", function: { name: "gifts", description: `Find gifts at real online stores, live. Each item is "store word", e.g. "brooklinen robe". Returns the top in-stock product per item, one line each: "- title price URL". Stores: ${storeList}.`, parameters: { type: "object", properties: { items: { type: "array", items: { type: "string" } } }, required: ["items"], additionalProperties: false } } };
const gift = { type: "function", function: { name: "gift", description: `Find one gift at a real online store, live. Returns the top in-stock product as one line: "- title price URL". Stores: ${storeList}.`, parameters: { type: "object", properties: { store: { type: "string", enum: Object.keys(STORES) }, q: { type: "string" } }, required: ["store", "q"], additionalProperties: false } } };
const user = "Find five Christmas gifts from real shopping websites: stanley tumbler, brooklinen robe, leatherman multitool, deathwish mug, puravida bracelet.";
const base = { temperature: 1, reasoning_effort: "low", max_completion_tokens: 1024 };
const head = (tool) => `Be terse. Do not deliberate.\n1. Call \`${tool}\` ${tool === "gifts" ? 'once with every requested item as "store word"' : "once per requested item, all in one turn"}.\n2. Reply with the tool output${tool === "gifts" ? "" : " lines"} only.`;
const EXTRA = {
  base: "",
  go: '\nYour private reasoning is always the single word "Go".',
  skip: "\nSkip reasoning entirely: start your output with the action itself.",
  obvious: "\nThe request already names every store and word, so there is nothing to decide.",
};
const cases = [];
for (const [k, extra] of Object.entries(EXTRA)) {
  cases.push({ name: `gifts-${k}`, body: { ...base, tools: [gifts], messages: [{ role: "system", content: head("gifts") + extra }, { role: "user", content: user }] } });
  cases.push({ name: `gift-${k}`, body: { ...base, tools: [gift], messages: [{ role: "system", content: head("gift") + extra }, { role: "user", content: user }] } });
}
writeFileSync(new URL("./cases/think.json", import.meta.url), JSON.stringify(cases, null, 1));
console.log(cases.length, "cases");
