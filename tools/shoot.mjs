#!/usr/bin/env node
// Full-page screenshots at true emulated viewports via CDP. Exits 1 if any width overflows horizontally
// or a page never fires its load event; exits 2 on usage errors.
// Usage: node tools/shoot.mjs <page.html> <outdir> <label> [--motion]   → <outdir>/<label>-{1280,768,375,320}.png
// Why not `chrome --screenshot --window-size=375,…`: macOS clamps the window to ~640 px, so mobile shots come out clipped.
// Pages must carry <meta name="viewport"> — without it, mobile emulation lays the page out at 980 px.
// Screenshots emulate prefers-reduced-motion so every reveal element and the hero's resting state are visible, unless --motion is passed.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const motion = args.includes('--motion');
const unknown = args.filter((a) => a.startsWith('--') && a !== '--motion');
if (unknown.length) { console.error(`unknown flag: ${unknown.join(' ')}`); process.exit(2); }
const [page, outdir, label] = args.filter((a) => !a.startsWith('--'));
if (!page || !outdir || !label) { console.error('usage: node tools/shoot.mjs <page.html> <outdir> <label> [--motion]'); process.exit(2); }
const file = resolve(page);
if (!existsSync(file)) { console.error(`no such page: ${file}`); process.exit(2); }
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const url = `file://${file}`;
const out = resolve(outdir);
mkdirSync(out, { recursive: true });

const freePort = () => new Promise((res, rej) => {
  const s = createServer();
  s.on('error', rej);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
});
const port = await freePort();
const profile = mkdtempSync(join(tmpdir(), 'carboai-shoot-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let ws;
// Must await Chrome's exit before deleting the profile: a still-shutting-down Chrome recreates
// the directory after rmSync unlinks it, which is how orphaned profiles pile up in $TMPDIR.
const cleanup = async () => {
  try { ws?.close(); } catch { /* already closed */ }
  if (chrome.exitCode === null && chrome.signalCode === null) {
    const exited = new Promise((r) => chrome.once('exit', r));
    try { chrome.kill(); } catch { /* already dead */ }
    let timer;
    await Promise.race([exited, new Promise((r) => { timer = setTimeout(r, 5000); })]);
    clearTimeout(timer);
    if (chrome.exitCode === null && chrome.signalCode === null) { try { chrome.kill('SIGKILL'); } catch { /* gone */ } await exited; }
  }
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
  catch (e) { console.error(`warning: could not remove ${profile}: ${e.code ?? e.message}`); }
};
process.on('SIGINT', async () => { await cleanup(); process.exit(130); });
process.on('SIGTERM', async () => { await cleanup(); process.exit(143); });

let failures = 0;
try {
  let version;
  for (let i = 0; i < 50 && !version; i += 1) {
    if (chrome.exitCode !== null) throw new Error(`Chrome exited early (code ${chrome.exitCode})`);
    try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  if (!version) throw new Error('Chrome did not start');

  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('CDP socket error')); });
  let id = 0; const pending = new Map(); const events = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); }
    else if (msg.method) events.push(msg);
  };
  ws.onclose = () => { for (const p of pending.values()) p.reject(new Error('Chrome disconnected')); pending.clear(); };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const i = ++id; pending.set(i, { resolve: res, reject: rej });
    ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

  for (const width of [1280, 768, 375, 320]) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Page.enable', {}, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 }, sessionId);
    if (!motion) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
    events.length = 0;
    const nav = await send('Page.navigate', { url }, sessionId);
    if (nav.errorText) throw new Error(`navigation failed at ${width}px: ${nav.errorText}`);
    let loaded = false;
    for (let i = 0; i < 100 && !loaded; i += 1) {
      loaded = events.some((e) => e.method === 'Page.loadEventFired' && e.sessionId === sessionId);
      if (!loaded) await new Promise((r) => setTimeout(r, 100));
    }
    if (!loaded) { console.log(`warning: load event never fired at ${width}px`); failures += 1; }
    await new Promise((r) => setTimeout(r, motion ? 2200 : 1200)); // fonts + images; with --motion, past the hero wave→bubble handoff (~1.3 s)
    // captureBeyondViewport paints the whole document but never scrolls it, so loading="lazy" images below
    // the fold stay blank. Grow the emulated viewport to the document height first and let them load.
    const { result: docHeight } = await send('Runtime.evaluate', { expression: 'document.documentElement.scrollHeight', returnByValue: true }, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width, height: Math.max(900, docHeight.value), deviceScaleFactor: 1, mobile: width < 768 }, sessionId);
    await new Promise((r) => setTimeout(r, 900)); // reveals now in view: 0.5 s transition + --i×80 ms stagger ≈ 740 ms worst case
    const { result } = await send('Runtime.evaluate', { expression: 'document.documentElement.scrollWidth - document.documentElement.clientWidth', returnByValue: true }, sessionId);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sessionId);
    const dest = join(out, `${label}-${width}.png`);
    writeFileSync(dest, Buffer.from(shot.data, 'base64'));
    console.log(`wrote ${dest}  (horizontal overflow: ${result.value}px)`);
    if (result.value > 0) failures += 1;
    await send('Target.closeTarget', { targetId });
  }
} finally {
  await cleanup();
}
process.exit(failures ? 1 : 0);
