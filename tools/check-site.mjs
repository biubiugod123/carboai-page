#!/usr/bin/env node
// Static gate for carboai-page marketing pages.
// Usage: node tools/check-site.mjs   (exit 1 on any problem)
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
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
    if (url.startsWith('#')) { if (!ids.has(url.slice(1))) fail(page, `anchor ${url} not found`); continue; }
    const [path] = url.split('#');
    if (!existsSync(resolve(dirname(join(ROOT, page)), path))) fail(page, `broken link ${url}`);
  }
}
console.log(failures ? `\n${failures} problem(s)` : `\nOK — ${PAGES.length} page(s) clean`);
process.exit(failures ? 1 : 0);
