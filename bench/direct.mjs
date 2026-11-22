#!/usr/bin/env node
// Direct Cerebras chat-completions microbenchmark.
// Purpose: characterise the per-call server decode rate (usage.completion_tokens /
// time_info.completion_time), i.e. the exact number the official speed patch reads,
// as a function of output length, reasoning effort and output kind.
// This is research tooling only; the bounty run itself goes through OpenClaw.
//
// Usage: node bench/direct.mjs <case.json> [--repeat N] [--out file.jsonl]
//   case.json: { "name": "...", "body": { ...chat completions body without model/stream... } }
// The API key is read from ../.env (never printed).

import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const MODEL = process.env.BENCH_MODEL ?? "moonshotai-kimi-k3.1-pro-trial";
const BASE = "https://api.cerebras.ai/v1";

function loadKey() {
  if (process.env.CEREBRAS_API_KEY) return process.env.CEREBRAS_API_KEY;
  const text = readFileSync(join(here, "..", ".env"), "utf8");
  const m = text.match(/^CEREBRAS_API_KEY=(.+)$/m);
  if (!m || !m[1].trim()) throw new Error("CEREBRAS_API_KEY is empty in .env");
  return m[1].trim().replace(/^["']|["']$/g, "");
}

export async function runOnce(body, key = loadKey()) {
  const started = performance.now();
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      stream_options: { include_usage: true },
      ...body,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, status: res.status, error: text.slice(0, 600) };
  }
  const rate = {};
  for (const h of ["x-ratelimit-remaining-requests-minute", "x-ratelimit-remaining-tokens-minute"]) {
    const v = res.headers.get(h);
    if (v != null) rate[h] = v;
  }
  let firstAt = null;
  let lastAt = null;
  let chunks = 0;
  let content = "";
  let reasoning = "";
  const toolCalls = {};
  let usage = null;
  let timeInfo = null;
  let finish = null;
  let buf = "";
  const dec = new TextDecoder();
  for await (const part of res.body) {
    buf += dec.decode(part, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      let j;
      try {
        j = JSON.parse(data);
      } catch {
        continue;
      }
      if (j.usage) usage = j.usage;
      if (j.time_info) timeInfo = j.time_info;
      const ch = j.choices?.[0];
      if (!ch) continue;
      if (ch.finish_reason) finish = ch.finish_reason;
      const d = ch.delta ?? {};
      const hasPayload = d.content || d.reasoning || d.reasoning_content || d.tool_calls;
      if (hasPayload) {
        const now = performance.now();
        if (firstAt == null) firstAt = now;
        lastAt = now;
        chunks += 1;
      }
      if (d.content) content += d.content;
      if (d.reasoning) reasoning += d.reasoning;
      if (d.reasoning_content) reasoning += d.reasoning_content;
      for (const tc of d.tool_calls ?? []) {
        const slot = (toolCalls[tc.index ?? 0] ??= { name: "", args: "" });
        if (tc.function?.name) slot.name += tc.function.name;
        if (tc.function?.arguments) slot.args += tc.function.arguments;
      }
    }
  }
  const ended = performance.now();
  const ct = usage?.completion_tokens;
  const st = timeInfo?.completion_time;
  return {
    ok: true,
    finish,
    completion_tokens: ct,
    reasoning_tokens: usage?.completion_tokens_details?.reasoning_tokens,
    prompt_tokens: usage?.prompt_tokens,
    cached_tokens: usage?.prompt_tokens_details?.cached_tokens,
    time_info: timeInfo,
    // The number the speed patch shows for this call:
    server_tps: ct && st ? ct / st : null,
    // Client-observed, for sanity only:
    client_ttft_ms: firstAt == null ? null : Math.round(firstAt - started),
    client_stream_ms: firstAt == null ? null : Math.round(lastAt - firstAt),
    client_total_ms: Math.round(ended - started),
    chunks,
    content_chars: content.length,
    reasoning_chars: reasoning.length,
    tool_calls: Object.values(toolCalls).map((t) => ({ name: t.name, args_chars: t.args.length })),
    content_head: content.slice(0, 160),
    rate,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("usage: node bench/direct.mjs <case.json> [--repeat N] [--out file.jsonl]");
    process.exit(2);
  }
  const opt = (name, dflt) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : dflt;
  };
  const repeat = Number(opt("--repeat", "1"));
  const out = resolve(opt("--out", join(here, "..", "logs", "direct.jsonl")));
  mkdirSync(dirname(out), { recursive: true });
  const spec = JSON.parse(readFileSync(file, "utf8"));
  const cases = Array.isArray(spec) ? spec : [spec];
  const key = loadKey();
  for (const c of cases) {
    for (let i = 0; i < repeat; i++) {
      const r = await runOnce(c.body, key);
      appendFileSync(out, JSON.stringify({ at: new Date().toISOString(), name: c.name, run: i, ...r }) + "\n");
      if (!r.ok) {
        console.log(`${c.name}#${i}  HTTP ${r.status}  ${r.error.replace(/\s+/g, " ").slice(0, 200)}`);
        if (r.status === 429) await new Promise((res) => setTimeout(res, 15000));
        continue;
      }
      console.log(
        `${c.name}#${i}  ${r.server_tps?.toFixed(0)} tok/s  tokens=${r.completion_tokens} (reason=${r.reasoning_tokens ?? "?"})  ` +
          `completion_time=${r.time_info?.completion_time?.toFixed?.(4)}s  prompt_time=${r.time_info?.prompt_time?.toFixed?.(4)}s  ` +
          `queue=${r.time_info?.queue_time?.toFixed?.(4)}s  finish=${r.finish}  tools=${r.tool_calls.length}  cached=${r.cached_tokens ?? 0}/${r.prompt_tokens}`,
      );
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
