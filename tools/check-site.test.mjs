#!/usr/bin/env node
// Fixture tests for tools/check-site.mjs. The gate derives ROOT from its own location, so every
// fixture is a throwaway directory with the script copied into <fixture>/tools/ and the pages laid
// out around it. Run: node --test tools/
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), 'check-site.mjs');
const made = [];
after(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });

// Every fixture path carries a space: the gate must survive living under "~/My Projects/…".
const fixture = (files) => {
  const dir = mkdtempSync(join(tmpdir(), 'carbo gate '));
  made.push(dir);
  mkdirSync(join(dir, 'tools'), { recursive: true });
  copyFileSync(SCRIPT, join(dir, 'tools', 'check-site.mjs'));
  for (const [rel, body] of Object.entries(files)) {
    const dest = join(dir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, body);
  }
  return dir;
};

const run = (dir) => {
  const script = join(dir, 'tools', 'check-site.mjs');
  try { return { status: 0, out: execFileSync(process.execPath, [script], { encoding: 'utf8' }) }; }
  catch (e) { return { status: e.status, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }; }
};
const count = (hay, needle) => hay.split(needle).length - 1;

// The valid minimal page is Task 13's how-it-works.html head with the paths for this depth.
const page = (up = '', { lang = 'en', body = '' } = {}) => `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>How the estimate works — Carbo-AI</title><meta name="description" content="How Carbo-AI turns a meal photo into a carb estimate, and why carb cycling tolerates estimates.">
<link rel="canonical" href="https://carboai.app/how-it-works.html"><link rel="alternate" hreflang="en" href="https://carboai.app/how-it-works.html"><link rel="alternate" hreflang="zh-Hans" href="https://carboai.app/zh/how-it-works.html"><link rel="alternate" hreflang="x-default" href="https://carboai.app/how-it-works.html">
<link rel="icon" href="${up}favicon.svg" type="image/svg+xml"><meta property="og:image" content="https://carboai.app/og-en.png"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap"><link rel="stylesheet" href="${up}assets/tokens.css"><link rel="stylesheet" href="${up}assets/site.css"></head>
<body><main class="wrap section"><h1>How the estimate works</h1>${body}</main></body></html>`;
const ASSETS = { 'favicon.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>', 'assets/tokens.css': ':root{}', 'assets/site.css': 'body{}' };
const sitemap = (...locs) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locs.map((l) => `<url><loc>${l}</loc></url>`).join('')}</urlset>`;

test('a directory with no pages is a wrong ROOT, not a clean site', () => {
  const { status, out } = run(fixture({}));
  assert.equal(status, 1);
  assert.match(out, /no pages found/);
});

test('one valid page under a path with spaces is clean', () => {
  const { status, out } = run(fixture({ ...ASSETS, 'index.html': page() }));
  assert.equal(status, 0, out);
  assert.match(out, /OK — 1 page\(s\) clean/);
});

test('links from zh/ resolve against zh/, not the site root', () => {
  const ok = run(fixture({ ...ASSETS, 'privacy.html': 'privacy',
    'zh/index.html': page('../', { lang: 'zh-Hans', body: '<a href="../privacy.html">privacy</a>' }) }));
  assert.equal(ok.status, 0, ok.out);
  const bad = run(fixture({ ...ASSETS,
    'zh/index.html': page('../', { lang: 'zh-Hans', body: '<a href="../nope.html">nope</a>' }) }));
  assert.equal(bad.status, 1);
  assert.match(bad.out, /zh\/index\.html: broken link \.\.\/nope\.html/);
});

test('a missing srcset candidate is reported exactly once', () => {
  const { status, out } = run(fixture({ ...ASSETS, 'b.png': 'png',
    'index.html': page('', { body: '<img src="b.png" srcset="a@2x.png 2x, b.png 640w" alt="">' }) }));
  assert.equal(status, 1);
  assert.equal(count(out, 'broken link a@2x.png'), 1, out);
});

test('remote and data: candidates are not local files', () => {
  const dataUri = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
  const { status, out } = run(fixture({ ...ASSETS, 'b.png': 'png',
    'index.html': page('', { body: `<img src="${dataUri}" srcset="https://cdn.example.com/y.png 2x, ${dataUri} 1x, b.png 640w" alt="">` }) }));
  assert.equal(status, 0, out);
});

test('dead href="#" is reported once however many there are', () => {
  const { status, out } = run(fixture({ ...ASSETS,
    'index.html': page('', { body: '<a href="#">one</a> <a href="#">two</a>' }) }));
  assert.equal(status, 1);
  assert.equal(count(out, 'dead href="#"'), 1, out);
});

test('data-frames lists are checked like any other local path', () => {
  const { status, out } = run(fixture({ ...ASSETS, 'a.webp': 'webp',
    'index.html': page('', { body: '<img src="a.webp" data-frames="a.webp, gone.webp" alt="">' }) }));
  assert.equal(status, 1);
  assert.equal(count(out, 'broken link gone.webp'), 1, out);
});

test('every mailto: must be the real support address', () => {
  const good = run(fixture({ ...ASSETS,
    'index.html': page('', { body: '<a href="mailto:support@carboai.app">mail</a>' }) }));
  assert.equal(good.status, 0, good.out);
  const bad = run(fixture({ ...ASSETS,
    'index.html': page('', { body: '<a href="mailto:suport@carboai.app">mail</a>' }) }));
  assert.equal(bad.status, 1);
  assert.match(bad.out, /mailto:suport@carboai\.app/);
});

test('sitemap lists every page and points only at files that exist', () => {
  const ok = run(fixture({ ...ASSETS, 'index.html': page(), 'zh/index.html': page('../', { lang: 'zh-Hans' }),
    'sitemap.xml': sitemap('https://carboai.app/', 'https://carboai.app/zh/') }));
  assert.equal(ok.status, 0, ok.out);
  const ghost = run(fixture({ ...ASSETS, 'index.html': page(),
    'sitemap.xml': sitemap('https://carboai.app/', 'https://carboai.app/ghost.html') }));
  assert.equal(ghost.status, 1);
  assert.match(ghost.out, /ghost\.html/);
  const unlisted = run(fixture({ ...ASSETS, 'index.html': page(), 'zh/index.html': page('../', { lang: 'zh-Hans' }),
    'sitemap.xml': sitemap('https://carboai.app/') }));
  assert.equal(unlisted.status, 1);
  assert.match(unlisted.out, /missing <loc> for zh\/index\.html/);
});

test('assets/site.js must release the inline head guard', () => {
  const bad = run(fixture({ ...ASSETS, 'index.html': page(), 'assets/site.js': 'console.log("no guard release")' }));
  assert.equal(bad.status, 1);
  assert.match(bad.out, /__jsGuard/);
  const good = run(fixture({ ...ASSETS, 'index.html': page(), 'assets/site.js': 'clearTimeout(window.__jsGuard);' }));
  assert.equal(good.status, 0, good.out);
});
