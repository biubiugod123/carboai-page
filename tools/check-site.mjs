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

const checkLocal = (page, url) => {
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
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const url = m[1];
    if (/^(https?:|mailto:|data:)/.test(url)) continue;
    if (url === '#') continue; // already reported above
    if (url.startsWith('#')) { if (!ids.has(url.slice(1))) fail(page, `anchor ${url} not found`); continue; }
    checkLocal(page, url);
  }
  for (const m of html.matchAll(/srcset="([^"]+)"/g)) {
    for (const candidate of m[1].split(',')) checkLocal(page, candidate.trim().split(/\s+/)[0]);
  }
}
console.log(failures ? `\n${failures} problem(s)` : `\nOK — ${PAGES.length} page(s) clean`);
process.exit(failures ? 1 : 0);
