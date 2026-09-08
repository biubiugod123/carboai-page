#!/usr/bin/env node
// Static gate for carboai-page marketing pages.
// Usage: node tools/check-site.mjs   (exit 1 on any problem)
// House style this relies on: double-quoted lowercase attributes; site links relative (no leading "/").
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = ['index.html', 'about.html', 'how-it-works.html',
  'zh/index.html', 'zh/about.html', 'zh/how-it-works.html']
  .filter((p) => existsSync(join(ROOT, p)));

const SUPPORT = 'mailto:support@carboai.app';
const FORBIDDEN = [
  [/\bCarboAI\b/, 'brand must be written "Carbo-AI"'],
  [/\b(supabase|gemini|revenuecat)\b/i, 'no vendor names'],
  [/google fit/i, 'no Google Fit claim'],
  [/\bmetabolism\b/i, 'no metabolism claim'],
  [/\$\s?\d+(\.\d\d)?/, 'no prices on the site'],
  [/free (tier|plan)/i, 'there is no free tier'],
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
if (PAGES.length === 0) fail('(site)', `no pages found under ${ROOT} — wrong ROOT?`);

// Carries its own protocol guard: the srcset and data-frames loops call it directly.
const checkLocal = (page, url) => {
  if (/^(https?:|mailto:|data:)/.test(url)) return;
  const [path] = url.split('#');
  if (!existsSync(resolve(dirname(join(ROOT, page)), path))) fail(page, `broken link ${url}`);
};

for (const page of PAGES) {
  const html = readFileSync(join(ROOT, page), 'utf8');
  const text = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  for (const [re, why] of FORBIDDEN) {
    const m = text.match(re);
    if (m) fail(page, `${why} (found "${m[0]}")`);
  }
  for (const [re, what] of REQUIRED_HEAD) if (!re.test(html)) fail(page, `missing ${what}`);
  if (/href="#"/.test(html)) fail(page, 'dead href="#"');
  // One wrong letter in the support address is the costliest single-character typo on the site.
  for (const m of html.matchAll(/mailto:[^"'\s>]+/g)) if (m[0] !== SUPPORT) fail(page, `wrong support address ${m[0]}`);
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const url = m[1];
    if (/^(https?:|mailto:|data:)/.test(url)) continue;
    if (url === '#') continue; // already reported above
    if (url.startsWith('#')) { if (!ids.has(url.slice(1))) fail(page, `anchor ${url} not found`); continue; }
    checkLocal(page, url);
  }
  // Candidates are comma-separated, but a data: URI carries commas of its own — match whole candidates.
  for (const m of html.matchAll(/srcset="([^"]+)"/g)) {
    for (const c of m[1].matchAll(/(?:data:\S+|[^\s,]+)(?:\s+[^\s,]+)?/g)) checkLocal(page, c[0].split(/\s+/)[0]);
  }
  for (const m of html.matchAll(/data-frames="([^"]+)"/g)) {
    for (const frame of m[1].split(',')) checkLocal(page, frame.trim());
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
  for (const page of PAGES) if (!listed.has(page)) fail('sitemap.xml', `missing <loc> for ${page}`);
}

console.log(failures ? `\n${failures} problem(s)` : `\nOK — ${PAGES.length} page(s) clean`);
process.exit(failures ? 1 : 0);
