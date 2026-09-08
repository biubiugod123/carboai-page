#!/usr/bin/env node
// Static gate for every page carboai.app publishes.
// Usage: node tools/check-site.mjs   (exit 1 on any problem)
// House style this relies on: double-quoted lowercase attributes; site links relative (no leading "/").
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { joinHeadings } from './cjk-joiner.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The published pages, listed by hand: a page in this list that is not on disk is a failure, not a
// page quietly skipped. Marketing pages get every check. Legal pages ("…:legal") get only the claim
// scan, the link checks and the support address — their design was frozen 2026-09-05 and their copy
// is mirrored in the app repo's docs/legal, so they carry neither this site's <head> block nor U+2060.
const MANIFEST = ['index.html', 'about.html', 'how-it-works.html',
  'zh/index.html', 'zh/about.html', 'zh/how-it-works.html',
  'privacy.html:legal', 'terms.html:legal', 'privacy-zh.html:legal', 'terms-zh.html:legal'];
// The fixture tests replace the manifest: CHECK_SITE_PAGES="index.html,zh/index.html,privacy-zh.html:legal".
const PAGES = (process.env.CHECK_SITE_PAGES || MANIFEST.join(','))
  .split(',').map((s) => s.trim()).filter(Boolean)
  .map((s) => { const [path, kind] = s.split(':'); return { path, legal: kind === 'legal' }; });

const SUPPORT = 'mailto:support@carboai.app';
const FORBIDDEN = [
  [/\bCarboAI\b/, 'brand must be written "Carbo-AI"'],
  [/\b(supabase|gemini|revenuecat)\b/i, 'no vendor names'],
  [/google fit/i, 'no Google Fit claim'],
  [/\bmetabolism\b/i, 'no metabolism claim'],
  [/\$\s?\d+(\.\d\d)?/, 'no prices on the site'],
  [/free (tier|plan)/i, 'there is no free tier'],
  [/谷歌健身/, 'no Google Fit claim'],
  [/代谢/, 'no metabolism claim'],
  [/[￥¥]\s?\d/, 'no prices on the site'],
  // 元 also opens 元旦/元气/元素…, so a digit before it is only a price when no such word follows.
  [/\d+\s*(元|日元)(?![素气旦宵件年数])/, 'no prices on the site'],
  // "免费下载" and "免费试用" are true and must stay legal; a free *tier* is what the site may not promise.
  [/(永久|完全|一直|基础.{0,4})免费|免费(版|套餐|试用期永久)/, 'there is no free tier'],
];
const REQUIRED_HEAD = [
  [/<html[^>]+lang="(en|zh-Hans)"/, '<html lang>'],
  [/<title>[^<]+<\/title>/, '<title>'],
  [/<meta name="description" content="[^"]+"/, 'meta description'],
  [/<meta property="og:image" content="https:\/\/carboai\.app\/[^"]+"/, 'og:image (absolute URL)'],
  [/<link rel="icon"/, 'favicon link'],
  [/<link rel="alternate" hreflang="/, 'hreflang'],
  [/<link rel="canonical" href="https:\/\/carboai\.app\//, 'canonical'],
];

let failures = 0;
const fail = (page, msg) => { failures += 1; console.log(`  ✗ ${page}: ${msg}`); };

// Carries its own protocol guard: the srcset and data-frames loops call it directly.
const checkLocal = (page, url) => {
  if (/^(https?:|mailto:|data:)/.test(url)) return;
  const [path] = url.split(/[#?]/);
  // href="?utm=x" and an empty data-frames entry resolve to the page's own directory, which exists —
  // existsSync would pass them. They are always mistakes.
  if (!path) { fail(page, `empty link ${url}`); return; }
  if (!existsSync(resolve(dirname(join(ROOT, page)), path))) fail(page, `broken link ${url}`);
};

for (const { path: page, legal } of PAGES) {
  if (!existsSync(join(ROOT, page))) { fail('(site)', `missing page: ${page}`); continue; }
  const html = readFileSync(join(ROOT, page), 'utf8');
  const text = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  for (const [re, why] of FORBIDDEN) {
    const m = text.match(re);
    if (m) fail(page, `${why} (found "${m[0]}")`);
  }
  if (!legal) for (const [re, what] of REQUIRED_HEAD) if (!re.test(html)) fail(page, `missing ${what}`);
  if (/href="#"/.test(html)) fail(page, 'dead href="#"');
  // One wrong letter in the support address is the costliest single-character typo on the site.
  for (const m of html.matchAll(/mailto:[^"'\s>]+/g)) if (m[0].split('?')[0] !== SUPPORT) fail(page, `wrong support address ${m[0]}`);
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const url = m[1];
    if (url === '#') continue; // already reported above
    if (url.startsWith('#')) { if (!ids.has(url.slice(1))) fail(page, `anchor ${url} not found`); continue; }
    checkLocal(page, url);
  }
  // Candidates are comma-separated, but a data: URI carries commas of its own — match whole candidates.
  for (const m of html.matchAll(/srcset="([^"]+)"/g)) {
    for (const c of m[1].matchAll(/(?:data:\S+|[^\s,]+)(?:\s+[^\s,]+)?/g)) checkLocal(page, c[0].split(/\s+/)[0]);
  }
  for (const m of html.matchAll(/data-frames="([^"]*)"/g)) {
    for (const frame of m[1].split(',')) checkLocal(page, frame.trim());
  }
  // Selected by content, not by path: any Chinese marketing page must have run through the joiner.
  if (!legal && /<html[^>]*\slang="zh/i.test(html) && joinHeadings(html) !== html) {
    fail(page, 'heading/bubble text not run through tools/cjk-joiner.mjs');
  }
}

// The inline head script hides reveal states behind class="js" and drops the class after 1.5 s if
// site.js never runs; site.js must cancel that timer or every animation vanishes 1.5 s in, silently.
const SITE_JS = join(ROOT, 'assets/site.js');
if (existsSync(SITE_JS) && !readFileSync(SITE_JS, 'utf8').includes('clearTimeout(window.__jsGuard)')) {
  fail('assets/site.js', 'must clearTimeout(window.__jsGuard) — the head guard would strip class="js"');
}

const SITEMAP = join(ROOT, 'sitemap.xml');
if (existsSync(SITEMAP)) {
  const listed = new Set();
  for (const m of readFileSync(SITEMAP, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const loc = m[1].trim();
    const rel = loc.replace(/^https:\/\/carboai\.app\//, '');
    const file = rel === '' || rel.endsWith('/') ? `${rel}index.html` : rel; // "/" → index.html, "/zh/" → zh/index.html
    listed.add(file);
    if (!existsSync(join(ROOT, file))) fail('sitemap.xml', `<loc> ${loc} has no file (${file})`);
  }
  for (const { path } of PAGES) if (!listed.has(path)) fail('sitemap.xml', `missing <loc> for ${path}`);
}

console.log(failures ? `\n${failures} problem(s)` : `\nOK — ${PAGES.length} page(s) clean`);
process.exit(failures ? 1 : 0);
