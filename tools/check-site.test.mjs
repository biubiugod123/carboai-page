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
// ("privacy.html:legal" marks a legal page); omit it to run against the real site manifest, and pass
// `[]` for the set-but-empty override the gate rejects as a config error.
const run = (dir, pages) => {
  const script = join(dir, 'tools', 'check-site.mjs');
  const env = { ...process.env };
  if (pages) env.CHECK_SITE_PAGES = pages.join(','); else delete env.CHECK_SITE_PAGES;
  try { return { status: 0, out: execFileSync(process.execPath, [script], { encoding: 'utf8', env }) }; }
  catch (e) { return { status: e.status, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }; }
};
const count = (hay, needle) => hay.split(needle).length - 1;

const EN = 'https://carboai.app/';
const ZH = 'https://carboai.app/zh/';
// The valid minimal page is Task 13's placeholder: the full marketing <head> and the site's
// `<main class="section"><div class="wrap">` gutter, with the paths for this depth. `self` and `alts`
// default to this site's conventional pair — index.html ↔ zh/index.html, each naming the other —
// because the gate requires every marketing page to declare a counterpart; tests about a page in
// isolation, or about a broken pair, pass `self` and `alts` explicitly.
const page = (up = '', {
  lang = 'en', body = '', noindex = false,
  self = up ? ZH : EN,
  alts = up ? [['zh-Hans', ZH], ['en', EN], ['x-default', EN]] : [['en', EN], ['zh-Hans', ZH], ['x-default', EN]],
} = {}) => `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>How the estimate works — Carbo-AI</title><meta name="description" content="How Carbo-AI turns a meal photo into a carb estimate, and why carb cycling tolerates estimates.">${noindex ? '<meta name="robots" content="noindex">' : ''}
<link rel="canonical" href="${self}">${alts.map(([l, href]) => `<link rel="alternate" hreflang="${l}" href="${href}">`).join('')}
<meta property="og:title" content="How the estimate works — Carbo-AI"><meta property="og:description" content="Photo, food, portion, carbs — and why a carb-cycling day tolerates an estimate."><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${up}favicon.svg" type="image/svg+xml"><meta property="og:image" content="https://carboai.app/og-en.png"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap"><link rel="stylesheet" href="${up}assets/tokens.css"><link rel="stylesheet" href="${up}assets/site.css"></head>
<body><main class="section"><div class="wrap"><h1>How the estimate works</h1>${body}</div></main></body></html>`;
// The smallest fixture the gate calls clean is a pair, so most tests write both halves and shape the
// English one; `PAIR` is the matching manifest.
const pair = (opts) => ({ 'index.html': page('', opts), 'zh/index.html': page('../', { lang: 'zh-Hans' }) });
const PAIR = ['index.html', 'zh/index.html'];
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
  const gone = run(fixture({ ...ASSETS, ...pair() }), [...PAIR, 'gone.html']);
  assert.equal(gone.status, 1);
  assert.match(gone.out, /\(site\): missing page: gone\.html/);
});

test('an override that names no page is a usage error, not a clean run', () => {
  for (const override of ['   ', ',,,']) {
    const { status, out } = run(fixture({ ...ASSETS, ...pair() }), [override]);
    assert.equal(status, 2, out);
    assert.match(out, /no pages to check/);
    assert.doesNotMatch(out, /page\(s\) clean/);
  }
});

test('CHECK_SITE_PAGES counts as set even when it is empty', () => {
  // Falling back to the built-in manifest here would run the real ten pages against a fixture that
  // holds two — a caller who meant to narrow the run would get someone else's site, or ten
  // missing-page findings, instead of being told the override says nothing.
  const { status, out } = run(fixture({ ...ASSETS, ...pair() }), []);
  assert.equal(status, 2, out);
  assert.match(out, /no pages to check/);
  assert.doesNotMatch(out, /missing page/);
  assert.doesNotMatch(out, /page\(s\) clean/);
});

test('a valid pair under a path with spaces is clean', () => {
  const { status, out } = run(fixture({ ...ASSETS, ...pair() }), PAIR);
  assert.equal(status, 0, out);
  assert.match(out, /OK — 2 page\(s\) clean/);
});

test('links from zh/ resolve against zh/, not the site root', () => {
  const files = (body) => ({ ...ASSETS, 'index.html': page(), 'zh/index.html': page('../', { lang: 'zh-Hans', body }) });
  const ok = run(fixture({ ...files('<a href="../privacy.html">privacy</a>'), 'privacy.html': 'privacy' }), PAIR);
  assert.equal(ok.status, 0, ok.out);
  const bad = run(fixture(files('<a href="../nope.html">nope</a>')), PAIR);
  assert.equal(bad.status, 1);
  assert.match(bad.out, /zh\/index\.html: broken link \.\.\/nope\.html/);
});

test('a link that is only a query or fragment string has no target', () => {
  const query = run(fixture({ ...ASSETS, ...pair({ body: '<a href="?utm=x">go</a>' }) }), PAIR);
  assert.equal(query.status, 1);
  assert.match(query.out, /index\.html: empty link \?utm=x/);
  const frames = run(fixture({ ...ASSETS, ...pair({ body: '<img src="favicon.svg" data-frames="" alt="">' }) }), PAIR);
  assert.equal(frames.status, 1);
  assert.match(frames.out, /index\.html: empty link/);
});

test('a missing srcset candidate is reported exactly once', () => {
  const { status, out } = run(fixture({ ...ASSETS, 'b.png': 'png',
    ...pair({ body: '<img src="b.png" srcset="a@2x.png 2x, b.png 640w" alt="">' }) }), PAIR);
  assert.equal(status, 1);
  assert.equal(count(out, 'broken link a@2x.png'), 1, out);
});

test('remote and data: candidates are not local files', () => {
  const dataUri = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
  const { status, out } = run(fixture({ ...ASSETS, 'b.png': 'png',
    ...pair({ body: `<img src="${dataUri}" srcset="https://cdn.example.com/y.png 2x, ${dataUri} 1x, b.png 640w" alt="">` }) }), PAIR);
  assert.equal(status, 0, out);
});

test('dead href="#" is reported once however many there are', () => {
  const { status, out } = run(fixture({ ...ASSETS,
    ...pair({ body: '<a href="#">one</a> <a href="#">two</a>' }) }), PAIR);
  assert.equal(status, 1);
  assert.equal(count(out, 'dead href="#"'), 1, out);
});

test('data-frames lists are checked like any other local path', () => {
  const { status, out } = run(fixture({ ...ASSETS, 'a.webp': 'webp',
    ...pair({ body: '<img src="a.webp" data-frames="a.webp, gone.webp" alt="">' }) }), PAIR);
  assert.equal(status, 1);
  assert.equal(count(out, 'broken link gone.webp'), 1, out);
});

test('a single-quoted href is a link like any other', () => {
  // The sweep spelled out `(?:href|src)="…"`, so a single-quoted link was not checked and not
  // reported either — the one failure mode a link checker may not have.
  const { status, out } = run(fixture({ ...ASSETS,
    ...pair({ body: "<a href='does-not-exist.html'>go</a>" }) }), PAIR);
  assert.equal(status, 1);
  assert.match(out, /index\.html: broken link does-not-exist\.html/);
});

test('srcset, data-frames, ids and the dead "#" read single quotes too', () => {
  const { status, out } = run(fixture({ ...ASSETS, 'b.png': 'png', ...pair({ body:
    "<img src='b.png' srcset='a@2x.png 2x, b.png 640w' data-frames='b.png, gone.webp' alt=''>"
    + "<a href='#'>dead</a><a href='#top'>anchor</a><h2 id='top'>top</h2>" }) }), PAIR);
  assert.equal(status, 1);
  assert.match(out, /broken link a@2x\.png/);
  assert.match(out, /broken link gone\.webp/);
  // A quoted "#" is still reported as a dead href and never chased as a file, and the anchor finds
  // its target through a single-quoted id — the sweep and these two rules must agree on quoting.
  assert.equal(count(out, 'dead href="#"'), 1, out);
  assert.doesNotMatch(out, /broken link #/);
  assert.doesNotMatch(out, /anchor #top not found/);
});

test('every mailto: must be the real support address', () => {
  const good = run(fixture({ ...ASSETS,
    ...pair({ body: '<a href="mailto:support@carboai.app">mail</a>' }) }), PAIR);
  assert.equal(good.status, 0, good.out);
  const bad = run(fixture({ ...ASSETS,
    ...pair({ body: '<a href="mailto:suport@carboai.app">mail</a>' }) }), PAIR);
  assert.equal(bad.status, 1);
  assert.match(bad.out, /mailto:suport@carboai\.app/);
});

test('every forbidden claim on one page is reported separately', () => {
  const { status, out } = run(fixture({ ...ASSETS,
    ...pair({ body: '<p>CarboAI costs $9.99 on the free tier.</p>' }) }), PAIR);
  assert.equal(status, 1);
  assert.match(out, /brand must be written "Carbo-AI"/);
  assert.match(out, /no prices on the site \(found "\$9\.99"\)/);
  assert.match(out, /there is no free tier \(found "free tier"\)/);
});

test('the zh claim guards read Chinese too', () => {
  const zh = (body) => run(fixture({ ...ASSETS, 'index.html': page(),
    'zh/index.html': page('../', { lang: 'zh-Hans', body }) }), PAIR);
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
  const zh = (body) => run(fixture({ ...ASSETS, 'index.html': page(),
    'zh/index.html': page('../', { lang: 'zh-Hans', body }) }), PAIR);
  const forever = zh('<p>永久免费。</p>');
  assert.equal(forever.status, 1);
  assert.match(forever.out, /there is no free tier \(found "永久免费"\)/);
  // The label names the word, not a claim: 代谢 is banned even inside a denial.
  const meta = zh('<p>本应用不做任何代谢方面的承诺。</p>');
  assert.equal(meta.status, 1);
  assert.match(meta.out, /metabolism wording \(site rule: no metabolism claims, not even disclaimers\) \(found "代谢"\)/);
  const english = run(fixture({ ...ASSETS, ...pair({ body: '<p>This is not a metabolism claim.</p>' }) }), PAIR);
  assert.equal(english.status, 1);
  assert.match(english.out, /metabolism wording \(site rule: no metabolism claims, not even disclaimers\) \(found "metabolism"\)/);
  // 元 opens 元旦 as often as it closes a price, and downloading really is free.
  const fine = zh('<p>2026 元旦上线，免费下载。</p>');
  assert.equal(fine.status, 0, fine.out);
});

test('a page without a canonical link is reported', () => {
  const files = pair();
  const { status, out } = run(fixture({ ...ASSETS, ...files,
    'index.html': files['index.html'].replace(/<link rel="canonical"[^>]*>/, '') }), PAIR);
  assert.equal(status, 1);
  assert.match(out, /index\.html: missing canonical/);
});

test('the marketing <head> must carry the sharing tags a shared link renders from', () => {
  const files = pair();
  const { status, out } = run(fixture({ ...ASSETS, ...files,
    'index.html': files['index.html'].replace(/<meta property="og:title"[^>]*>/, '') }), PAIR);
  assert.equal(status, 1);
  assert.match(out, /index\.html: missing og:title/);
});

test('hreflang must point at a published page, and that page must point back', () => {
  const both = {
    'about.html': page('', { self: 'https://carboai.app/about.html',
      alts: [['en', 'https://carboai.app/about.html'], ['zh-Hans', 'https://carboai.app/zh/about.html'], ['x-default', 'https://carboai.app/about.html']] }),
    'zh/about.html': page('../', { lang: 'zh-Hans', self: 'https://carboai.app/zh/about.html',
      alts: [['zh-Hans', 'https://carboai.app/zh/about.html'], ['en', 'https://carboai.app/about.html'], ['x-default', 'https://carboai.app/about.html']] }),
  };
  const ok = run(fixture({ ...ASSETS, ...both }), ['about.html', 'zh/about.html']);
  assert.equal(ok.status, 0, ok.out);
  // The gap this rule was written to find: the English page forgot its Chinese alternate, so the
  // Chinese page names a page that does not name it back and Google drops the pair.
  const oneWay = run(fixture({ ...ASSETS, ...both,
    'about.html': both['about.html'].replace('<link rel="alternate" hreflang="zh-Hans" href="https://carboai.app/zh/about.html">', '') }),
  ['about.html', 'zh/about.html']);
  assert.equal(oneWay.status, 1);
  assert.match(oneWay.out, /zh\/about\.html: hreflang en → about\.html has no alternate back/);
  // The Chinese page's own zh-Hans self-alternate is still reciprocal, so that is the only failure.
  assert.equal(count(oneWay.out, 'has no alternate back'), 1, oneWay.out);
  // x-default nominates the fallback; the fallback need not name every locale that falls back to it.
  assert.doesNotMatch(oneWay.out, /hreflang x-default .* has no alternate back/);
  // Dropping that alternate also left about.html with no counterpart of its own.
  assert.match(oneWay.out, /about\.html: no alternate-language page declared/);
  const ghost = run(fixture({ ...ASSETS, 'index.html': page('', { alts: [['en', 'https://carboai.app/gone.html']] }) }), ['index.html']);
  assert.equal(ghost.status, 1);
  assert.match(ghost.out, /index\.html: hreflang en → https:\/\/carboai\.app\/gone\.html is not a page in the manifest/);
});

test('an alternate is read whatever order and quoting its attributes come in', () => {
  // The parse must never be the thing that decides a pair is broken. Spelling out rel → hreflang →
  // href in one regex meant `<link rel="alternate" href="…" hreflang="zh-Hans">` parsed as no
  // alternate at all: this page silently lost its return leg, and zh/ was blamed for the gap.
  const files = pair();
  const flipped = files['index.html'].replace(`<link rel="alternate" hreflang="zh-Hans" href="${ZH}">`,
    `<link rel='alternate' href="${ZH}" hreflang='zh-Hans'>`);
  const ok = run(fixture({ ...ASSETS, ...files, 'index.html': flipped }), PAIR);
  assert.equal(ok.status, 0, ok.out);
  // And a pair that really is one-sided is still reported against the page missing the return leg.
  const dropped = files['index.html'].replace(`<link rel="alternate" hreflang="zh-Hans" href="${ZH}">`, '');
  const bad = run(fixture({ ...ASSETS, ...files, 'index.html': dropped }), PAIR);
  assert.equal(bad.status, 1);
  assert.match(bad.out, /zh\/index\.html: hreflang en → index\.html has no alternate back/);
});

test('x-default does not stand in for the return leg', () => {
  // x-default names the fallback, not a locale: a page whose only link back is the fallback's is
  // still an unpaired page as far as Google is concerned. Losing that leg also leaves the Chinese
  // page with no counterpart at all, which the pair rule reports in its own words.
  const files = pair();
  const { status, out } = run(fixture({ ...ASSETS, ...files,
    'zh/index.html': files['zh/index.html'].replace(`<link rel="alternate" hreflang="en" href="${EN}">`, '') }), PAIR);
  assert.equal(status, 1);
  // hreflang values are case-insensitive, so the gate normalises them once and findings quote the
  // normalised tag: the fixture writes hreflang="zh-Hans" and reads back as zh-hans.
  assert.match(out, /index\.html: hreflang zh-hans → zh\/index\.html has no alternate back/);
  assert.match(out, /zh\/index\.html: no alternate-language page declared/);
});

test('a marketing page must name a counterpart, not only itself', () => {
  const alone = (up, lang, self) => page(up, { lang, self, alts: [[lang, self], ['x-default', self]] });
  const solo = run(fixture({ ...ASSETS, 'index.html': alone('', 'en', EN), 'zh/index.html': alone('../', 'zh-Hans', ZH) }), PAIR);
  assert.equal(solo.status, 1);
  assert.match(solo.out, /index\.html: no alternate-language page declared/);
  assert.match(solo.out, /zh\/index\.html: no alternate-language page declared/);
  // Each page is its own only alternate, which is reciprocal — the pair rule is what catches it.
  assert.equal(count(solo.out, 'has no alternate back'), 0, solo.out);
  const paired = run(fixture({ ...ASSETS, ...pair() }), PAIR);
  assert.equal(paired.status, 0, paired.out);
});

test('an uppercase X-Default is the fallback too, not a counterpart or a return leg', () => {
  // hreflang values are case-insensitive. Compared as written, "X-Default" did both of the jobs the
  // fallback may not do: it stood in as a counterpart, and it answered another page's return leg.
  const alone = (up, lang, self, other) => page(up, { lang, self, alts: [[lang, self], ['X-Default', other]] });
  const both = run(fixture({ ...ASSETS,
    'index.html': alone('', 'en', EN, ZH), 'zh/index.html': alone('../', 'zh-Hans', ZH, EN) }), PAIR);
  assert.equal(both.status, 1);
  assert.match(both.out, /index\.html: no alternate-language page declared/);
  assert.match(both.out, /zh\/index\.html: no alternate-language page declared/);
  assert.equal(count(both.out, 'has no alternate back'), 0, both.out); // the fallback owes no return leg
  // And it supplies none: index.html names zh/index.html, which names nothing back but the fallback.
  const files = pair();
  const oneWay = run(fixture({ ...ASSETS, ...files,
    'zh/index.html': page('../', { lang: 'zh-Hans', alts: [['zh-Hans', ZH], ['X-Default', EN]] }) }), PAIR);
  assert.equal(oneWay.status, 1);
  assert.match(oneWay.out, /index\.html: hreflang zh-hans → zh\/index\.html has no alternate back/);
  assert.match(oneWay.out, /zh\/index\.html: no alternate-language page declared/);
});

test('a marketing page with no alternate at all is missing its hreflang', () => {
  // The rule could be deleted with every test still green: the pair rule fires on the same page but
  // says something else, and a page with no <link rel="alternate"> deserves to be told which tag.
  const files = pair();
  const { status, out } = run(fixture({ ...ASSETS, ...files,
    'index.html': files['index.html'].replace(/<link rel="alternate"[^>]*>/g, '') }), PAIR);
  assert.equal(status, 1);
  assert.match(out, /index\.html: missing hreflang/);
  assert.match(out, /index\.html: no alternate-language page declared/);
  // A legal page is never asked for one: the four real ones carry no hreflang at all.
  const frozen = run(fixture({ 'privacy.html': legal() }), ['privacy.html:legal']);
  assert.equal(frozen.status, 0, frozen.out);
  assert.doesNotMatch(frozen.out, /missing hreflang/);
});

test('rel= is the attribute name, not the tail of data-rel', () => {
  // `<link\s[^>]*rel=` also matched `data-rel=`, so a stylesheet some script had tagged for itself
  // was read as this page's canonical (the first match wins) and as an alternate it never declared.
  // A decoy carrying no hreflang is dropped by the alternate filter anyway, so this one carries one.
  const traps = '<link rel="stylesheet" data-rel="canonical" href="assets/site.css">'
    + '<link rel="stylesheet" data-rel="alternate" hreflang="en" href="assets/site.css">';
  const files = pair();
  const { status, out } = run(fixture({ ...ASSETS, ...files,
    'index.html': files['index.html'].replace('<link rel="canonical"', `${traps}<link rel="canonical"`) }), PAIR);
  assert.equal(status, 0, out); // read without the guard: missing canonical, and an alternate → assets/site.css
});

test("data-href on an alternate is not that alternate's href", () => {
  // attrOf's leading \s is the whole guard: `\shref=` cannot start inside `data-href`. Without it
  // the first match wins and this alternate points at TRAP instead of at the Chinese page.
  const files = pair();
  const trapped = files['index.html'].replace(`hreflang="zh-Hans" href="${ZH}"`,
    `hreflang="zh-Hans" data-href="TRAP" href="${ZH}"`);
  // TRAP is on disk because the href/src sweep reads data-src lazy-loading paths on purpose: the
  // finding under test is the hreflang one, and a broken link would just be noise on top of it.
  const { status, out } = run(fixture({ ...ASSETS, ...files, 'index.html': trapped, TRAP: 'a file' }), PAIR);
  assert.equal(status, 0, out);
});

test("a legal page is a page, but never a marketing page's counterpart", () => {
  // privacy.html is in the manifest, so this alternate is not a ghost — but a frozen legal page
  // carries no hreflang of its own, so naming it leaves index.html as orphaned as naming nothing.
  const { status, out } = run(fixture({ ...ASSETS, 'privacy.html': legal(),
    'index.html': page('', { alts: [['en', EN], ['zh-Hans', 'https://carboai.app/privacy.html'], ['x-default', EN]] }) }),
  ['index.html', 'privacy.html:legal']);
  assert.equal(status, 1);
  assert.match(out, /index\.html: no alternate-language page declared/);
  assert.doesNotMatch(out, /privacy\.html is not a page in the manifest/);
});

test('a robots noindex is read whatever its case, order, quoting or company', () => {
  const withRobots = (robots) => run(fixture({ ...ASSETS, ...pair(),
    'zh/index.html': page('../', { lang: 'zh-Hans' }).replace('<link rel="canonical"', `${robots}<link rel="canonical"`),
    'sitemap.xml': sitemap(EN, ZH) }), PAIR);
  for (const robots of ['<meta name="robots" content="NOINDEX">',
    '<meta content="noindex, nofollow" name="ROBOTS">',
    "<meta name='robots' content='noindex'>",
    '<meta name="robots" content="none">']) {
    const { status, out } = withRobots(robots);
    assert.equal(status, 1, `${robots}\n${out}`);
    assert.match(out, /sitemap\.xml: zh\/index\.html is noindex and must not be listed/);
  }
  // "index, follow" contains neither directive, and an indexable page belongs in the sitemap.
  const indexable = withRobots('<meta name="robots" content="index, follow">');
  assert.equal(indexable.status, 0, indexable.out);
});

test('sitemap lists every page and points only at files that exist', () => {
  const ok = run(fixture({ ...ASSETS, ...pair(), 'sitemap.xml': sitemap(EN, ZH) }), PAIR);
  assert.equal(ok.status, 0, ok.out);
  const ghost = run(fixture({ ...ASSETS, ...pair(),
    'sitemap.xml': sitemap(EN, ZH, 'https://carboai.app/ghost.html') }), PAIR);
  assert.equal(ghost.status, 1);
  assert.match(ghost.out, /<loc> .* has no file/);
  const unlisted = run(fixture({ ...ASSETS, ...pair(), 'sitemap.xml': sitemap(EN) }), PAIR);
  assert.equal(unlisted.status, 1);
  assert.match(unlisted.out, /missing <loc> for zh\/index\.html/);
});

test('a noindex page stays out of the sitemap, and only a noindex page may', () => {
  const both = { ...ASSETS, 'index.html': page(), 'zh/index.html': page('../', { lang: 'zh-Hans', noindex: true }) };
  const listed = run(fixture({ ...both, 'sitemap.xml': sitemap(EN, ZH) }), PAIR);
  assert.equal(listed.status, 1);
  assert.match(listed.out, /sitemap\.xml: zh\/index\.html is noindex and must not be listed/);
  const held = run(fixture({ ...both, 'sitemap.xml': sitemap(EN) }), PAIR);
  assert.equal(held.status, 0, held.out); // noindex earns the exemption from "every page is listed"
  const indexable = run(fixture({ ...ASSETS, ...pair(), 'sitemap.xml': sitemap(EN) }), PAIR);
  assert.equal(indexable.status, 1);
  assert.match(indexable.out, /sitemap\.xml: missing <loc> for zh\/index\.html/);
});

test('legal pages are scanned for claims but not for the marketing <head> or the joiner', () => {
  const clean = run(fixture({ 'privacy.html': legal('<p>Photos are deleted after processing.</p>') }), ['privacy.html:legal']);
  assert.equal(clean.status, 0, clean.out); // no description, canonical, og:image or icon — and no failure
  const vendor = run(fixture({ 'privacy.html': legal('<p>Stored in Supabase.</p>') }), ['privacy.html:legal']);
  assert.equal(vendor.status, 1);
  assert.match(vendor.out, /privacy\.html: no vendor names \(found "Supabase"\)/);
  assert.doesNotMatch(vendor.out, /missing (canonical|meta description|og:image|og:title|twitter:card|hreflang)/);
  assert.doesNotMatch(vendor.out, /no alternate-language page declared/);
  const zh = run(fixture({ 'privacy-zh.html': legal('<h2>照片怎么处理</h2>', 'zh-Hans') }), ['privacy-zh.html:legal']);
  assert.equal(zh.status, 0, zh.out); // frozen Chinese copy, no U+2060
});

test('zh headings and the hero bubble must be run through the joiner', () => {
  const body = '<h2>拍一张碳水算清</h2><div class="bubble">午饭给我看看。</div>';
  const bad = run(fixture({ ...ASSETS, 'index.html': page(),
    'zh/index.html': page('../', { lang: 'zh-Hans', body }) }), PAIR);
  assert.equal(bad.status, 1);
  assert.match(bad.out, /zh\/index\.html: heading\/bubble text not run through tools\/cjk-joiner\.mjs/);
  const good = run(fixture({ ...ASSETS, 'index.html': page(),
    'zh/index.html': joinHeadings(page('../', { lang: 'zh-Hans', body })) }), PAIR);
  assert.equal(good.status, 0, good.out);
  // The rule follows <html lang>, not the directory: the same file at the root is checked the same way.
  const root = run(fixture({ ...ASSETS, ...pair({ lang: 'zh-Hans', body }) }), PAIR);
  assert.equal(root.status, 1);
  assert.match(root.out, /index\.html: heading\/bubble text not run through/);
});

test('assets/site.js must release the inline head guard', () => {
  const bad = run(fixture({ ...ASSETS, ...pair(), 'assets/site.js': 'console.log("no guard release")' }), PAIR);
  assert.equal(bad.status, 1);
  assert.match(bad.out, /__jsGuard/);
  const good = run(fixture({ ...ASSETS, ...pair(), 'assets/site.js': 'clearTimeout(window.__jsGuard);' }), PAIR);
  assert.equal(good.status, 0, good.out);
});
