#!/usr/bin/env node
// Refreshes the numbers in README.md (results table, head-to-head, recorded attempts) from
// evidence/. Run after bench/collect-evidence.mjs.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = execFileSync("node", [join(here, "results-table.mjs")], { encoding: "utf8" });
const table = out.split("\n").filter((l) => l.startsWith("|")).join("\n");
const h2h = /santa won (\d+) of (\d+) rounds, median ([\d,]+) against ([\d,]+)/.exec(out);
const rec = /Recorded web chat attempts \(santa\): (\d+) complete of (\d+) started, median ([\d,]+), best ([\d,]+); best without a provider retry on screen ([\d,-]+)/.exec(out);
const file = join(here, "..", "README.md");
let s = readFileSync(file, "utf8");
const set = (name, text) => {
  const re = new RegExp(`(<!-- ${name}:start -->)[\\s\\S]*?(<!-- ${name}:end -->)`);
  if (!re.test(s)) throw new Error(`marker ${name} not found`);
  s = s.replace(re, (_, a, b) => `${a}${text}${b}`);
};
set("table", `\n${table}\n`);
set("h2h", `\`santa\` won ${h2h[1]} of ${h2h[2]} rounds (median ${h2h[3]} against ${h2h[4]}).`);
set("recorded", `Across ${rec[1]} complete recorded attempts (of ${rec[2]} started) the median is ${rec[3]} and the best is ${rec[4]} tok/s; the best without a provider retry visible on screen is ${rec[5]}.`);
writeFileSync(file, s);
console.log(out.trim().split("\n").slice(-3).join("\n"));
