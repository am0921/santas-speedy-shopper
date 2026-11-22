// Direct-API cases: does the shape of the tool-call arguments change the decode rate of the tool-call turn?
import { writeFileSync } from "node:fs";
import { STORES } from "../plugin/santa-shop/stores.js";
const storeList = Object.entries(STORES).map(([id, s]) => `${id} (${s.sells})`).join("; ");
const desc = (how) => `Find gifts at real online stores, live. ${how} Returns the top in-stock product per item, one line each: "- title price URL". Stores: ${storeList}.`;
const fn = (name, description, properties, required) => ({ type: "function", function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } } });
const T = {
  arr: fn("gifts", desc('Each item is "store word", e.g. "brooklinen robe".'), { items: { type: "array", items: { type: "string" } } }, ["items"]),
  str: fn("gifts", desc('`list` is comma-separated "store word" items, e.g. "brooklinen robe, deathwish mug".'), { list: { type: "string" } }, ["list"]),
  req: fn("gifts", desc("`request` is the user's request, verbatim; it names a store and a word per item."), { request: { type: "string" } }, ["request"]),
};
const user = "Find five Christmas gifts from real shopping websites: stanley tumbler, brooklinen robe, leatherman multitool, deathwish mug, puravida bracelet.";
const base = { temperature: 1, reasoning_effort: "low", max_completion_tokens: 1024 };
const sys = (arg) => `Be terse. Do not deliberate.\n1. Call \`gifts\` once with ${arg}.\n2. Reply with the tool output only.`;
const cases = [
  { name: "args-arr", body: { ...base, tools: [T.arr], messages: [{ role: "system", content: sys('every requested item as "store word"') }, { role: "user", content: user }] } },
  { name: "args-str", body: { ...base, tools: [T.str], messages: [{ role: "system", content: sys("the requested items as one comma-separated string") }, { role: "user", content: user }] } },
  { name: "args-req", body: { ...base, tools: [T.req], messages: [{ role: "system", content: sys("the user's request, verbatim") }, { role: "user", content: user }] } },
];
writeFileSync(new URL("./cases/args.json", import.meta.url), JSON.stringify(cases, null, 1));
