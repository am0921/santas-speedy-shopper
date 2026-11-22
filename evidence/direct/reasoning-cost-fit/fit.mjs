// OLS fit: completion_time = a + b*visible_tokens + c*reasoning_tokens, per file set
import { readFileSync } from "node:fs";
const rows = [];
for (const f of process.argv.slice(2)) for (const l of readFileSync(f, "utf8").trim().split("\n")) { const r = JSON.parse(l); if (r.server_tps && r.finish !== "length") rows.push(r); }
const X = rows.map(r => [1, r.completion_tokens - (r.reasoning_tokens ?? 0), r.reasoning_tokens ?? 0]);
const y = rows.map(r => r.time_info.completion_time);
const k = 3, A = Array.from({ length: k }, () => Array(k + 1).fill(0));
X.forEach((x, n) => { for (let i = 0; i < k; i++) { for (let j = 0; j < k; j++) A[i][j] += x[i] * x[j]; A[i][k] += x[i] * y[n]; } });
for (let i = 0; i < k; i++) { for (let j = i + 1; j < k; j++) { const f = A[j][i] / A[i][i]; for (let m = i; m <= k; m++) A[j][m] -= f * A[i][m]; } }
const b = Array(k).fill(0); for (let i = k - 1; i >= 0; i--) { let s = A[i][k]; for (let j = i + 1; j < k; j++) s -= A[i][j] * b[j]; b[i] = s / A[i][i]; }
const pred = X.map(x => x.reduce((s, v, i) => s + v * b[i], 0)); const my = y.reduce((a, c) => a + c) / y.length;
const r2 = 1 - y.reduce((s, v, i) => s + (v - pred[i]) ** 2, 0) / y.reduce((s, v) => s + (v - my) ** 2, 0);
console.log(`n=${rows.length} fixed=${(b[0]*1000).toFixed(1)}ms perVisible=${(b[1]*1000).toFixed(3)}ms (${(1/b[1]).toFixed(0)} tok/s) perReason=${(b[2]*1000).toFixed(3)}ms (${(1/b[2]).toFixed(0)} tok/s) R2=${r2.toFixed(2)}`);
