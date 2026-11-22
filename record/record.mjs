#!/usr/bin/env node
// Records one (or --n) real attempt(s) of the Santa task in the patched OpenClaw web chat.
//
//   node record/record.mjs [--agent santa] [--prompt-file prompts/xmas.txt] [--n 1]
//                          [--create rpc|ui] [--width 1440] [--height 900] [--headed]
//                          [--expand-tool] [--tail-ms 4000] [--timeout-ms 180000]
//
// Per attempt it saves under record/out/<timestamp>-<mean>/:
//   video.webm (+ video.mp4 if ffmpeg exists), final.png (full page), result.json
// Nothing here touches the measurement: the badge text is read from the UI exactly as
// the speed patch renders it, and the per-call serverGeneration values are read back
// from the gateway's session history only as a cross-check.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const PW = join(
  root,
  "openclaw/node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core/index.mjs",
);
const { chromium } = await import(existsSync(PW) ? PW : "playwright-core");

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const flag = (n) => args.includes(n);
const agent = opt("--agent", "santa");
const promptFile = opt("--prompt-file", join(root, "prompts/xmas.txt"));
const n = Number(opt("--n", "1"));
const createMode = opt("--create", "rpc"); // rpc: pre-create session off-camera; ui: /new page
const width = Number(opt("--width", "1440"));
const height = Number(opt("--height", "900"));
const tailMs = Number(opt("--tail-ms", "4000"));
const timeoutMs = Number(opt("--timeout-ms", "180000"));
const gapMs = Number(opt("--gap-ms", "3000"));
const headed = flag("--headed");
const expandTool = flag("--expand-tool");
const keepRaw = flag("--keep-raw");
const displayName = opt("--title", "Christmas gifts");
const port = process.env.OPENCLAW_GATEWAY_PORT ?? "19789";
const base = `http://127.0.0.1:${port}`;
const stateDir = join(root, "state");
const token = readFileSync(join(stateDir, "gateway-token"), "utf8").trim();
const prompt = readFileSync(promptFile, "utf8").trim();
const outRoot = join(here, "out");
mkdirSync(outRoot, { recursive: true });

const hasFfmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
const nodeBin = (() => {
  const r = spawnSync("mise", ["where", "node@24.22.3"], { encoding: "utf8" });
  const p = r.status === 0 ? join(r.stdout.trim(), "bin/node") : null;
  return p && existsSync(p) ? p : process.execPath;
})();
const scrub = (s) => String(s ?? "").replaceAll(token, "<token>");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");

/** Creates an empty session through the Gateway's own sessions.create method (off-camera). */
function createSession(key) {
  const env = {
    ...process.env,
    OPENCLAW_STATE_DIR: stateDir,
    OPENCLAW_CONFIG_PATH: join(stateDir, "openclaw.json"),
    OPENCLAW_GATEWAY_TOKEN: token,
    OPENCLAW_GATEWAY_PORT: port,
    OPENCLAW_DISABLE_BONJOUR: "1",
    OPENCLAW_SKIP_CHANNELS: "1",
    OPENCLAW_NO_AUTO_UPDATE: "1",
  };
  const params = JSON.stringify({ agentId: agent, key, displayName });
  const r = spawnSync(
    nodeBin,
    [join(root, "openclaw/openclaw.mjs"), "gateway", "call", "sessions.create", "--json", "--params", params],
    { cwd: root, env, encoding: "utf8" },
  );
  const m = r.stdout.match(/\{[\s\S]*\}/);
  const json = m ? JSON.parse(m[0]) : null;
  if (r.status !== 0 || !json?.ok) throw new Error(`sessions.create failed: ${scrub(r.stderr || r.stdout).slice(-300)}`);
  return json.key;
}

async function history(sessionKey) {
  const res = await fetch(`${base}/sessions/${encodeURIComponent(sessionKey)}/history?limit=200`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`history HTTP ${res.status}`);
  const json = await res.json();
  return json.messages ?? json.items ?? [];
}

function callsFrom(messages) {
  return messages
    .filter((m) => m.role === "assistant" && m.serverGeneration)
    .map((m) => m.serverGeneration)
    .filter((s) => s.completionMs > 0 && s.outputTokens >= 1)
    .map((s) => ({ tokens: s.outputTokens, ms: +s.completionMs.toFixed(2), tps: Math.round(s.outputTokens / (s.completionMs / 1000)) }));
}

const parseNum = (s) => (s == null ? null : Number(String(s).replace(/,/g, "")));
function parseBadge(text) {
  const m = /([\d.,]+)\s*tok\/s mean\s*·\s*([\d.,]+)\s*p90/.exec(text ?? "");
  return m ? { mean: parseNum(m[1]), p90: parseNum(m[2]) } : { mean: null, p90: null };
}

/** UI state probe, evaluated in the page. */
function probe() {
  const vis = (e) => !!e && !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
  const groups = [...document.querySelectorAll(".chat-group.assistant")];
  const last = groups.at(-1) ?? null;
  const badge = last?.querySelector(".chat-gen-speed:not(.chat-gen-speed--live):not(.chat-gen-speed--summary)");
  const summary = document.querySelector(".chat-gen-speed--summary");
  const live = document.querySelector(".chat-gen-speed--live");
  const stop = [...document.querySelectorAll(".chat-send-btn--stop")].some(vis);
  const working = [...document.querySelectorAll(".chat-group--working, .chat-typing-indicator")].some(vis);
  const textEls = last ? [...last.querySelectorAll(".chat-text")] : [];
  const links = last
    ? [...last.querySelectorAll(".chat-text a[href]")].map((a) => a.href).filter((h) => /^https?:/.test(h) && !h.startsWith(location.origin))
    : [];
  return {
    assistantGroups: groups.length,
    badgeText: badge?.textContent?.trim() ?? null,
    summaryText: summary?.textContent?.trim() ?? null,
    badgeTitle: badge?.getAttribute("title") ?? null,
    retrying: /Retrying/.test(document.querySelector(".chat-group--working, .chat-working, main")?.textContent ?? ""),
    summaryTitle: summary?.getAttribute("title") ?? null,
    liveText: live?.textContent?.trim() ?? null,
    running: stop || working || !!live,
    answerText: textEls.map((e) => e.innerText.trim()).filter(Boolean).join("\n"),
    links: [...new Set(links)],
  };
}

async function attempt(i, browser) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const name = `rec-${Date.now().toString(36)}`;
  const tmpDir = join(outRoot, `.tmp-${name}`);
  mkdirSync(tmpDir, { recursive: true });
  const result = { ok: false, sawRetry: false, agent, createMode, startedAt, prompt, sessionKey: null, url: null, badgeText: null, summaryText: null, meanTps: null, p90Tps: null, answerText: "", links: [], calls: [], durationMs: null, error: null };
  let sessionKey = `agent:${agent}:${name}`;
  if (createMode === "rpc") {
    sessionKey = createSession(sessionKey);
  }
  const context = await browser.newContext({
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    colorScheme: "light",
    viewport: { width, height },
    recordVideo: { dir: tmpDir, size: { width, height } },
  });
  const videoT0 = Date.now();
  const page = await context.newPage();
  let trimS = 0;
  const consoleErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(scrub(m.text()).slice(0, 300)));
  try {
    const path = createMode === "rpc" ? `/chat/${encodeURIComponent(agent)}/${name}` : `/new?agent=${encodeURIComponent(agent)}`;
    await page.goto(`${base}${path}#token=${token}`);
    const composer = page
      .locator(createMode === "rpc" ? 'textarea[aria-label="Chat composer"]:visible' : "textarea:visible")
      .first();
    await composer.waitFor({ state: "visible", timeout: 20000 });
    // Collapse the sidebar with the UI's own control (hides the identity card / hostname).
    const collapse = page.locator('button[aria-label="Collapse sidebar"]');
    if (await collapse.isVisible().catch(() => false)) await collapse.click();
    await page.mouse.move(width - 5, height / 2);
    await sleep(500);
    // Everything before this point (page load, sidebar with the identity card) is cut from the mp4.
    trimS = (Date.now() - videoT0) / 1000;
    await sleep(1200);
    await composer.click();
    await composer.pressSequentially(prompt, { delay: 6 });
    await sleep(400);
    const send = page.locator("button.chat-send-btn--send").first();
    if (await send.isEnabled().catch(() => false)) await send.click();
    else await composer.press("Enter");
    const sentAt = Date.now();

    // Wait until the run is idle and the per-response badge is on the latest assistant group,
    // and that state has been stable for 1.5 s (the tool turn and the answer are two calls).
    let stableSince = 0;
    let last = null;
    let sawRunning = false;
    while (Date.now() - sentAt < timeoutMs) {
      await sleep(250);
      const s = await page.evaluate(probe);
      if (s.running) sawRunning = true;
      if (s.retrying) result.sawRetry = true;
      const done = !s.running && s.badgeText && s.assistantGroups > 0;
      const same = last && last.badgeText === s.badgeText && last.answerText === s.answerText;
      if (done && same) {
        if (!stableSince) stableSince = Date.now();
        if (Date.now() - stableSince >= 1500) { last = s; break; }
      } else stableSince = 0;
      // Idle with no badge for a long time after the run ended = failed run (429, error, ...).
      if (!s.running && sawRunning && !s.badgeText && Date.now() - sentAt > 20000) {
        last = s;
        throw new Error("run ended without a speed badge: " + (s.answerText || "(no answer)").slice(0, 200));
      }
      last = s;
    }
    if (!last?.badgeText) throw new Error("timed out waiting for the speed badge");
    if (createMode === "ui") sessionKey = await page.evaluate(() => location.pathname);
    result.url = page.url().split("#")[0];
    if (expandTool) {
      // Open the run's tool steps (the UI's own "N other operations" toggle) so the live
      // searches and link checks are visible in the final frame.
      const step = page.locator(".chat-group.assistant").last().getByText(/other operations?|^Gifts?$|^Verify$/i).first();
      if (await step.isVisible().catch(() => false)) await step.click().catch(() => {});
      await sleep(400);
    }
    // Reveal the per-response badge (it shows on hover, the UI's own behaviour).
    const lastGroup = page.locator(".chat-group.assistant").last();
    await lastGroup.scrollIntoViewIfNeeded().catch(() => {});
    await lastGroup.hover({ position: { x: 10, y: 10 } }).catch(() => {});
    await sleep(tailMs);
    const s = await page.evaluate(probe);
    Object.assign(result, {
      badgeText: s.badgeText,
      summaryText: s.summaryText,
      badgeTitle: s.badgeTitle,
      summaryTitle: s.summaryTitle,
      answerText: s.answerText,
      links: s.links,
      // Reported number = the session readout next to the composer: the mean over the run's
      // model calls, identical to the session history. Right after a live run the per-response
      // badge counts a turn with N parallel tool calls N times (after a reload it shows the
      // same value as the session readout), so it is kept only as responseBadge*.
      ...(({ mean, p90 }) => ({ meanTps: mean, p90Tps: p90 }))(parseBadge(s.summaryText ?? s.badgeText)),
      ...(({ mean, p90 }) => ({ responseBadgeMean: mean, responseBadgeP90: p90 }))(parseBadge(s.badgeText)),
    });
    await page.screenshot({ path: join(tmpDir, "final.png"), fullPage: true });
    result.ok = result.meanTps != null && result.links.length >= 5;
    if (!result.ok && !result.error) result.error = `badge=${!!result.badgeText} links=${result.links.length}`;
  } catch (e) {
    result.error = scrub(e.message).slice(0, 400);
    await page.screenshot({ path: join(tmpDir, "final.png"), fullPage: true }).catch(() => {});
    await sleep(1000);
  }
  result.sessionKey = sessionKey;
  result.consoleErrors = consoleErrors.slice(0, 10);
  const video = page.video();
  await context.close();
  result.durationMs = Date.now() - t0;
  if (result.sessionKey?.startsWith("agent:")) {
    try { result.calls = callsFrom(await history(result.sessionKey)); } catch (e) { result.historyError = e.message; }
  }
  const tag = result.meanTps != null ? String(Math.round(result.meanTps)) : "failed";
  const dir = join(outRoot, `${stamp()}-${tag}`);
  renameSync(tmpDir, dir);
  if (video) {
    const vp = await video.path();
    const webm = join(dir, "video.webm");
    renameSync(join(dir, vp.split("/").pop()), webm);
    if (hasFfmpeg) {
      const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", trimS.toFixed(2), "-i", webm, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart", join(dir, "video.mp4")]);
      result.video = r.status === 0 ? join(dir, "video.mp4") : webm;
      result.trimmedLeadSeconds = +trimS.toFixed(2);
      // The raw webm still shows the first second (expanded sidebar with the identity card).
      if (r.status === 0 && !keepRaw) unlinkSync(webm);
    } else result.video = webm;
  }
  result.screenshot = join(dir, "final.png");
  result.dir = dir;
  writeFileSync(join(dir, "result.json"), JSON.stringify(result, null, 2));
  return result;
}

const browser = await chromium.launch({ channel: "chrome", headless: !headed });
const results = [];
try {
  for (let i = 0; i < n; i++) {
    let r;
    try {
      r = await attempt(i, browser);
    } catch (e) {
      r = { ok: false, error: scrub(e.message).slice(0, 300), meanTps: null };
    }
    results.push(r);
    console.log(`#${i + 1}/${n} ${r.ok ? "OK  " : "FAIL"} mean=${r.meanTps ?? "-"} p90=${r.p90Tps ?? "-"} links=${r.links?.length ?? 0} calls=[${(r.calls ?? []).map((c) => `${c.tps}(${c.tokens}t)`).join(", ")}] ${r.dir ?? ""} ${r.error ?? ""}`);
    if (i < n - 1) await sleep(gapMs);
  }
} finally {
  await browser.close();
}
const sorted = results.toSorted((a, b) => (b.meanTps ?? -1) - (a.meanTps ?? -1));
console.log("\nrank  mean   p90    links  ok    dir");
sorted.forEach((r, k) =>
  console.log(`${String(k + 1).padEnd(5)} ${String(r.meanTps ?? "-").padEnd(6)} ${String(r.p90Tps ?? "-").padEnd(6)} ${String(r.links?.length ?? 0).padEnd(6)} ${String(r.ok).padEnd(5)} ${r.dir ?? r.error}`),
);
writeFileSync(join(outRoot, `summary-${stamp()}.json`), JSON.stringify(sorted, null, 2));
