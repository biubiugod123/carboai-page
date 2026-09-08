#!/usr/bin/env node
// Fixture tests for tools/check-site.mjs. The gate derives ROOT from its own location, so every
// fixture is a throwaway directory with the script copied into <fixture>/tools/ and the pages laid
// out around it. Run: node --test 'tools/**/*.test.mjs'
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { joinHeadings } from './cjk-joiner.mjs';

const TOOLS = dirname(fileURLToPath(import.meta.url));
// check-site.mjs imports the joiner, so the fixture's tools/ needs both files.
const SCRIPT = ['check-site.mjs', 'cjk-joiner.mjs'];
const made = [];
after(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });

// Every fixture path carries a space: the gate must survive living under "~/My Projects/…".
const fixture = (files) => {
  const dir = mkdtempSync(join(tmpdir(), 'carbo gate '));
  made.push(dir);
  mkdirSync(join(dir, 'tools'), { recursive: true });
  for (const f of SCRIPT) copyFileSync(join(TOOLS, f), join(dir, 'tools', f));
  for (const [rel, body] of Object.entries(files)) {
    const dest = join(dir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, body);
  }
  return dir;
};

// `pages` replaces the gate's built-in manifest with the pages this fixture actually wrote
// ("privacy.html:legal" marks a legal page); omit it to run against the real site manifest.
const run = (dir, pages) => {
  const script = join(dir, 'tools', 'check-site.mjs');
  const env = { ...process.env };
  if (pages) env.CHECK_SITE_PAGES = pages.join(','); else delete env.CHECK_SITE_PAGES;
  try { return { status: 0, out: execFileSync(process.execPath, [script], { encoding: 'utf8', env }) }; }
  catch (e) { return { status: e.status, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }; }
};
const count = (hay, needle) => hay.split(needle).length - 1;

// The valid minimal page is Task 13's placeholder: the full marketing <head> and the site's
// `<main class="section"><div class="wrap">` gutter, with the paths for this depth. `self` and
// `alts` default to a page that is its own only alternate — which is what the reciprocity check
// asks of a page with no translation; tests that need a real pair pass both explicitly.
const page = (up = '', {
  lang = 'en', body = '', noindex = false,
  self = up ? 'https://carboai.app/zh/' : 'https://carboai.app/',
  alts = [[lang, self], ['x-default', self]],
} = {}) => `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>How the estimate works — Carbo-AI</title><meta name="description" content="How Carbo-AI turns a meal photo into a carb estimate, and why carb cycling tolerates estimates.">${noindex ? '<meta name="robots" content="noindex">' : ''}
<link rel="canonical" href="${self}">${alts.map(([l, href]) => `<link rel="alternate" hreflang="${l}" href="${href}">`).join('')}
<meta property="og:title" content="How the estimate works — Carbo-AI"><meta property="og:description" content="Photo, food, portion, carbs — and why a carb-cycling day tolerates an estimate."><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${up}favicon.svg" type="image/svg+xml"><meta property="og:image" content="https://carboai.app/og-en.png"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap"><link rel="stylesheet" href="${up}assets/tokens.css"><link rel="stylesheet" href="${up}assets/site.css"></head>
<body><main class="section"><div class="wrap"><h1>How the estimate works</h1>${body}</div></main></body></html>`;
// A legal page as the real ones are: frozen 2026-09-05, so no description, canonical, og:image or icon.
const legal = (body = '', lang = 'en') => `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy Policy — Carbo-AI</title></head><body><h1>Privacy Policy</h1>${body}</body></html>`;
const ASSETS = { 'favicon.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>', 'assets/tokens.css': ':root{}', 'assets/site.css': 'body{}' };
const sitemap = (...locs) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locs.map((l) => `<url><loc>${l}</loc></url>`).join('')}</urlset>`;

test('a manifest page that is not on disk fails; it is never silently skipped', () => {
  const empty = run(fixture({})); // no override: the real ten-page manifest, none of it present
  assert.equal(empty.status, 1);
  assert.match(empty.out, /\(site\): missing page: index\.html/);
  const gone = run(fixture({ ...ASSETS, 'index.html': page() }), ['index.html', 'gone.html']);
  assert.equal(gone.status, 1);
  assert.match(gone.out, /\(site\): missing page: gone\.html/);
});

test('an override that names no page is a usage error, not a clean run', () => {
  for (const override of ['   ', ',,,']) {
    const { status, out } = run(fixture({ ...ASSETS, 'index.html': page() }), [override]);
    assert.equal(status, 2, out);
    assert.match(out, /no pages to check/);
    assert.doesNotMatch(out, /page\(s\) clean/);
  }
});

test('one valid page under a path with spaces is clean', () => {
  const { status, out } = run(fixture({ ...ASSETS, 'index.html': page() }), ['index.html']);
  assert.equal(status, 0, out);
  assert.match(out, /OK — 1 page\(s\) clean/);
});

test('links from zh/ resolve against zh/, not the site root', () => {
  const ok = run(fixture({ ...ASSETS, 'privacy.html': 'privacy',
    'zh/index.html': page('../', { lang: 'zh-Hans', body: '<a href="../privacy.html">privacy</a>' }) }), ['zh/index.html']);
  assert.equal(ok.status, 0, ok.out);
  const bad = run(fixture({ ...ASSETS,
    'zh/index.html': page('../', { lang: 'zh-Hans', body: '<a href="../nope.html">nope</a>' }) }), ['zh/index.html']);
  assert.equal(bad.status, 1);
  assert.match(bad.out, /zh\/index\.html: broken link \.\.\/nope\.html/);
});

test('a link that is only a query or fragment string has no target', () => {
  const query = run(fixture({ ...ASSETS, 'index.html': page('', { body: '<a href="?utm=x">go</a>' }) }), ['index.html']);
  assert.equal(query.status, 1);
  assert.match(query.out, /index\.html: empty link \?utm=x/);
  const frames = run(fixture({ ...ASSETS, 'index.html': page('', { body: '<img src="favicon.svg" data-frames="" alt="">' }) }), ['index.html']);
  assert.equal(frames.status, 1);
  assert.match(frames.out, /index\.html: empty link/);
});

test('a missing srcset candidate is reported exactly once', () => {
  const { status, out } = run(fixture({ ...ASSETS, 'b.png': 'png',
    'index.html': page('', { body: '<img src="b.png" srcset="a@2x.png 2x, b.png 640w" alt="">' }) }), ['index.html']);
  assert.equal(status, 1);
  assert.equal(count(out, 'broken link a@2x.png'), 1, out);
});

test('remote and data: candidates are not local files', () => {
  const dataUri = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
  const { status, out } = run(fixture({ ...ASSETS, 'b.png': 'png',
    'index.html': page('', { body: `<img src="${dataUri}" srcset="https://cdn.example.com/y.png 2x, ${dataUri} 1x, b.png 640w" alt="">` }) }), ['index.html']);
  assert.equal(status, 0, out);
});

test('dead href="#" is reported once however many there are', () => {
  const { status, out } = run(fixture({ ...ASSETS,
    'index.html': page('', { body: '<a href="#">one</a> <a href="#">two</a>' }) }), ['index.html']);
  assert.equal(status, 1);
  assert.equal(count(out, 'dead href="#"'), 1, out);
});

test('data-frames lists are checked like any other local path', () => {
  const { status, out } = run(fixture({ ...ASSETS, 'a.webp': 'webp',
    'index.html': page('', { body: '<img src="a.webp" data-frames="a.webp, gone.webp" alt="">' }) }), ['index.html']);
  assert.equal(status, 1);
  assert.equal(count(out, 'broken link gone.webp'), 1, out);
});

test('every mailto: must be the real support address', () => {
  const good = run(fixture({ ...ASSETS,
    'index.html': page('', { body: '<a href="mailto:support@carboai.app">mail</a>' }) }), ['index.html']);
  assert.equal(good.status, 0, good.out);
  const bad = run(fixture({ ...ASSETS,
    'index.html': page('', { body: '<a href="mailto:suport@carboai.app">mail</a>' }) }), ['index.html']);
  assert.equal(bad.status, 1);
  assert.match(bad.out, /mailto:suport@carboai\.app/);
});

test('every forbidden claim on one page is reported separately', () => {
  const { status, out } = run(fixture({ ...ASSETS,
    'index.html': page('', { body: '<p>CarboAI costs $9.99 on the free tier.</p>' }) }), ['index.html']);
  assert.equal(status, 1);
  assert.match(out, /brand must be written "Carbo-AI"/);
  assert.match(out, /no prices on the site \(found "\$9\.99"\)/);
  assert.match(out, /there is no free tier \(found "free tier"\)/);
});

test('the zh claim guards read Chinese too', () => {
  const zh = (body) => run(fixture({ ...ASSETS, 'zh/index.html': page('../', { lang: 'zh-Hans', body }) }), ['zh/index.html']);
  assert.match(zh('<p>每月 30 元。</p>').out, /no prices on the site/);
  assert.match(zh('<p>￥30 起。</p>').out, /no prices on the site/);
  assert.match(zh('<p>促进代谢。</p>').out, /metabolism wording/);
  assert.match(zh('<p>支持谷歌健身。</p>').out, /no Google Fit claim/);
  assert.match(zh('<p>有免费版。</p>').out, /there is no free tier/);
  // The real zh FAQ answers "Carbo-AI 免费吗？" with "免费下载。" — that must stay legal.
  const ok = zh('<p>Carbo-AI 免费吗？免费下载。如提供免费试用，条件会在购买前展示。</p>');
  assert.equal(ok.status, 0, ok.out);
});

test('the widened zh guards catch more claims without catching ordinary Chinese', () => {
  const zh = (body) => run(fixture({ ...ASSETS, 'zh/index.html': page('../', { lang: 'zh-Hans', body }) }), ['zh/index.html']);
  const forever = zh('<p>永久免费。</p>');
  assert.equal(forever.status, 1);
  assert.match(forever.out, /there is no free tier \(found "永久免费"\)/);
  // The label names the word, not a claim: 代谢 is banned even inside a denial.
  const meta = zh('<p>本应用不做任何代谢方面的承诺。</p>');
  assert.equal(meta.status, 1);
  assert.match(meta.out, /metabolism wording \(site rule: no metabolism claims, not even disclaimers\) \(found "代谢"\)/);
  const english = run(fixture({ ...ASSETS, 'index.html': page('', { body: '<p>This is not a metabolism claim.</p>' }) }), ['index.html']);
  assert.equal(english.status, 1);
  assert.match(english.out, /metabolism wording \(site rule: no metabolism claims, not even disclaimers\) \(found "metabolism"\)/);
  // 元 opens 元旦 as often as it closes a price, and downloading really is free.
  const fine = zh('<p>2026 元旦上线，免费下载。</p>');
  assert.equal(fine.status, 0, fine.out);
});

test('a page without a canonical link is reported', () => {
  const { status, out } = run(fixture({ ...ASSETS,
    'index.html': page().replace(/<link rel="canonical"[^>]*>/, '') }), ['index.html']);
  assert.equal(status, 1);
  assert.match(out, /missing canonical/);
});

test('the marketing <head> must carry the sharing tags a shared link renders from', () => {
  const { status, out } = run(fixture({ ...ASSETS,
    'index.html': page().replace(/<meta property="og:title"[^>]*>/, '') }), ['index.html']);
  assert.equal(status, 1);
  assert.match(out, /index\.html: missing og:title/);
});

test('hreflang must point at a published page, and that page must point back', () => {
  const pair = {
    'about.html': page('', { self: 'https://carboai.app/about.html',
      alts: [['en', 'https://carboai.app/about.html'], ['zh-Hans', 'https://carboai.app/zh/about.html'], ['x-default', 'https://carboai.app/about.html']] }),
    'zh/about.html': page('../', { lang: 'zh-Hans', self: 'https://carboai.app/zh/about.html',
      alts: [['zh-Hans', 'https://carboai.app/zh/about.html'], ['en', 'https://carboai.app/about.html'], ['x-default', 'https://carboai.app/about.html']] }),
  };
  const ok = run(fixture({ ...ASSETS, ...pair }), ['about.html', 'zh/about.html']);
  assert.equal(ok.status, 0, ok.out);
  // The gap this rule was written to find: the English page forgot its Chinese alternate, so the
  // Chinese page names a page that does not name it back and Google drops the pair.
  const oneWay = run(fixture({ ...ASSETS, ...pair,
    'about.html': pair['about.html'].replace('<link rel="alternate" hreflang="zh-Hans" href="https://carboai.app/zh/about.html">', '') }),
  ['about.html', 'zh/about.html']);
  assert.equal(oneWay.status, 1);
  assert.match(oneWay.out, /zh\/about\.html: hreflang en → about\.html has no alternate back/);
  // The Chinese page's own zh-Hans self-alternate is still reciprocal, so that is the only failure.
  assert.equal(count(oneWay.out, 'has no alternate back'), 1, oneWay.out);
  // x-default nominates the fallback; the fallback need not name every locale that falls back to it.
  assert.doesNotMatch(oneWay.out, /hreflang x-default .* has no alternate back/);
  const ghost = run(fixture({ ...ASSETS, 'index.html': page('', { alts: [['en', 'https://carboai.app/gone.html']] }) }), ['index.html']);
  assert.equal(ghost.status, 1);
  assert.match(ghost.out, /index\.html: hreflang en → https:\/\/carboai\.app\/gone\.html is not a page in the manifest/);
});

test('sitemap lists every page and points only at files that exist', () => {
  const ok = run(fixture({ ...ASSETS, 'index.html': page(), 'zh/index.html': page('../', { lang: 'zh-Hans' }),
    'sitemap.xml': sitemap('https://carboai.app/', 'https://carboai.app/zh/') }), ['index.html', 'zh/index.html']);
  assert.equal(ok.status, 0, ok.out);
  const ghost = run(fixture({ ...ASSETS, 'index.html': page(),
    'sitemap.xml': sitemap('https://carboai.app/', 'https://carboai.app/ghost.html') }), ['index.html']);
  assert.equal(ghost.status, 1);
  assert.match(ghost.out, /<loc> .* has no file/);
  const unlisted = run(fixture({ ...ASSETS, 'index.html': page(), 'zh/index.html': page('../', { lang: 'zh-Hans' }),
    'sitemap.xml': sitemap('https://carboai.app/') }), ['index.html', 'zh/index.html']);
  assert.equal(unlisted.status, 1);
  assert.match(unlisted.out, /missing <loc> for zh\/index\.html/);
});

test('a noindex page stays out of the sitemap, and only a noindex page may', () => {
  const both = { ...ASSETS, 'index.html': page(), 'zh/index.html': page('../', { lang: 'zh-Hans', noindex: true }) };
  const listed = run(fixture({ ...both, 'sitemap.xml': sitemap('https://carboai.app/', 'https://carboai.app/zh/') }), ['index.html', 'zh/index.html']);
  assert.equal(listed.status, 1);
  assert.match(listed.out, /sitemap\.xml: zh\/index\.html is noindex and must not be listed/);
  const held = run(fixture({ ...both, 'sitemap.xml': sitemap('https://carboai.app/') }), ['index.html', 'zh/index.html']);
  assert.equal(held.status, 0, held.out); // noindex earns the exemption from "every page is listed"
  const indexable = run(fixture({ ...ASSETS, 'index.html': page(), 'zh/index.html': page('../', { lang: 'zh-Hans' }),
    'sitemap.xml': sitemap('https://carboai.app/') }), ['index.html', 'zh/index.html']);
  assert.equal(indexable.status, 1);
  assert.match(indexable.out, /sitemap\.xml: missing <loc> for zh\/index\.html/);
});

test('legal pages are scanned for claims but not for the marketing <head> or the joiner', () => {
  const clean = run(fixture({ 'privacy.html': legal('<p>Photos are deleted after processing.</p>') }), ['privacy.html:legal']);
  assert.equal(clean.status, 0, clean.out); // no description, canonical, og:image or icon — and no failure
  const vendor = run(fixture({ 'privacy.html': legal('<p>Stored in Supabase.</p>') }), ['privacy.html:legal']);
  assert.equal(vendor.status, 1);
  assert.match(vendor.out, /privacy\.html: no vendor names \(found "Supabase"\)/);
  assert.doesNotMatch(vendor.out, /missing (canonical|meta description|og:image|og:title|twitter:card)/);
  const zh = run(fixture({ 'privacy-zh.html': legal('<h2>照片怎么处理</h2>', 'zh-Hans') }), ['privacy-zh.html:legal']);
  assert.equal(zh.status, 0, zh.out); // frozen Chinese copy, no U+2060
});

test('zh headings and the hero bubble must be run through the joiner', () => {
  const body = '<h2>拍一张碳水算清</h2><div class="bubble">午饭给我看看。</div>';
  const bad = run(fixture({ ...ASSETS, 'zh/index.html': page('../', { lang: 'zh-Hans', body }) }), ['zh/index.html']);
  assert.equal(bad.status, 1);
  assert.match(bad.out, /zh\/index\.html: heading\/bubble text not run through tools\/cjk-joiner\.mjs/);
  const good = run(fixture({ ...ASSETS,
    'zh/index.html': joinHeadings(page('../', { lang: 'zh-Hans', body })) }), ['zh/index.html']);
  assert.equal(good.status, 0, good.out);
  // The rule follows <html lang>, not the directory: the same file at the root is checked the same way.
  const root = run(fixture({ ...ASSETS, 'index.html': page('', { lang: 'zh-Hans', body }) }), ['index.html']);
  assert.equal(root.status, 1);
  assert.match(root.out, /index\.html: heading\/bubble text not run through/);
});

test('assets/site.js must release the inline head guard', () => {
  const bad = run(fixture({ ...ASSETS, 'index.html': page(), 'assets/site.js': 'console.log("no guard release")' }), ['index.html']);
  assert.equal(bad.status, 1);
  assert.match(bad.out, /__jsGuard/);
  const good = run(fixture({ ...ASSETS, 'index.html': page(), 'assets/site.js': 'clearTimeout(window.__jsGuard);' }), ['index.html']);
  assert.equal(good.status, 0, good.out);
});
