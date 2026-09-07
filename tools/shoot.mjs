#!/usr/bin/env node
// Full-page screenshots at true emulated viewports via CDP.
// Usage: node tools/shoot.mjs <page.html> <outdir> <label>   → <outdir>/<label>-{1280,768,375}.png
// Why not `chrome --screenshot --window-size=375,…`: macOS clamps the window to ~640 px, so mobile shots come out clipped.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [page, outdir, label] = process.argv.slice(2);
if (!page || !outdir || !label) { console.error('usage: node tools/shoot.mjs <page.html> <outdir> <label>'); process.exit(2); }
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const url = `file://${resolve(page)}`;
mkdirSync(outdir, { recursive: true });

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/carboai-shoot-profile', 'about:blank'], { stdio: 'ignore' });
let version;
for (let i = 0; i < 50 && !version; i += 1) {
  try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { await new Promise((r) => setTimeout(r, 200)); }
}
if (!version) { chrome.kill(); throw new Error('Chrome did not start'); }

const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0; const pending = new Map(); const events = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); }
  else if (msg.method) events.push(msg);
};
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const i = ++id; pending.set(i, { resolve: res, reject: rej });
  ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
});

for (const width of [1280, 768, 375]) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 }, sessionId);
  events.length = 0;
  await send('Page.navigate', { url }, sessionId);
  for (let i = 0; i < 100 && !events.some((e) => e.method === 'Page.loadEventFired'); i += 1) await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => setTimeout(r, 1200)); // fonts + images
  const { result } = await send('Runtime.evaluate', { expression: 'document.documentElement.scrollWidth - document.documentElement.clientWidth', returnByValue: true }, sessionId);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sessionId);
  const file = `${outdir}/${label}-${width}.png`;
  writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log(`wrote ${file}  (horizontal overflow: ${result.value}px)`);
  await send('Target.closeTarget', { targetId });
}
ws.close(); chrome.kill();
