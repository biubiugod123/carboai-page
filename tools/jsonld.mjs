#!/usr/bin/env node
// Structured data for AI/search crawlers. Generates one JSON-LD block per page FROM the page's own
// visible content (title, meta description, the <details> FAQ) and writes it between the
// <!-- jsonld --> markers in <head>. Nothing here is authored by hand, so the block can never say
// something the page does not — Google requires FAQPage text to match what a reader sees.
// Run: node tools/jsonld.mjs        (rewrites the pages)
//      node tools/jsonld.mjs --check (exit 1 if any page is out of date)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://carboai.app';
const START = '<!-- jsonld -->', END = '<!-- /jsonld -->';

// Pages that carry a FAQPage; the two home pages also describe the app itself.
export const PAGES = [
  { file: 'index.html', url: `${SITE}/`, lang: 'en', app: true },
  { file: 'zh/index.html', url: `${SITE}/zh/`, lang: 'zh-Hans', app: true },
  { file: 'about.html', url: `${SITE}/about.html`, lang: 'en' },
  { file: 'zh/about.html', url: `${SITE}/zh/about.html`, lang: 'zh-Hans' },
];

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/⁠/g, '');
// Visible text of a fragment: block ends become line breaks, list items become "1." / "-" lines.
const text = (html) => decode(html
  .replace(/<\/(p|li|ol|ul|h[1-6])>/g, '\n')
  .replace(/<li>/g, '- ')
  .replace(/<[^>]+>/g, ''))
  .split('\n').map((l) => l.trim()).filter(Boolean).join('\n');

const attr = (html, re) => { const m = html.match(re); if (!m) throw new Error(`missing ${re}`); return decode(m[1]); };

export function faqOf(html) {
  const out = [];
  for (const m of html.matchAll(/<details[^>]*>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)) {
    out.push({ '@type': 'Question', name: text(m[1]), acceptedAnswer: { '@type': 'Answer', text: text(m[2]) } });
  }
  return out;
}

export function graphFor(page, html) {
  const title = attr(html, /<title>([^<]+)<\/title>/);
  const description = attr(html, /<meta name="description" content="([^"]+)"/);
  const image = attr(html, /<meta property="og:image" content="([^"]+)"/);
  const graph = [];
  if (page.app) {
    graph.push({
      '@type': 'SoftwareApplication',
      '@id': `${SITE}/#app`,
      name: 'Carbo-AI',
      url: page.url,
      image,
      description,
      inLanguage: page.lang,
      applicationCategory: 'HealthApplication',
      operatingSystem: 'iOS',
      // The download is free; the subscription price is deliberately not on the site.
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      author: { '@type': 'Organization', '@id': `${SITE}/#org` },
    });
    graph.push({ '@type': 'Organization', '@id': `${SITE}/#org`, name: 'Carbo-AI', url: `${SITE}/`, logo: `${SITE}/apple-touch-icon.png`, email: 'support@carboai.app' });
  }
  graph.push({ '@type': 'WebPage', '@id': page.url, url: page.url, name: title, description, inLanguage: page.lang, ...(page.app ? { about: { '@id': `${SITE}/#app` } } : {}) });
  const faq = faqOf(html);
  if (faq.length) graph.push({ '@type': 'FAQPage', '@id': `${page.url}#faq`, url: page.url, inLanguage: page.lang, mainEntity: faq });
  return { '@context': 'https://schema.org', '@graph': graph };
}

export function blockFor(page, html) {
  // "</" inside a <script> would end it early; JSON.stringify never emits "</" for these strings
  // but escape defensively.
  const json = JSON.stringify(graphFor(page, html), null, 1).replace(/<\//g, '<\\/');
  return `${START}\n  <script type="application/ld+json">${json}</script>\n  ${END}`;
}

export function inject(page, html) {
  const block = blockFor(page, html);
  const re = new RegExp(`${START}[\\s\\S]*?${END}`);
  if (re.test(html)) return html.replace(re, () => block);
  return html.replace('</head>', `  ${block}\n</head>`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const page of PAGES) {
    const path = join(ROOT, page.file);
    const html = readFileSync(path, 'utf8');
    const next = inject(page, html);
    if (next === html) continue;
    stale++;
    if (check) console.error(`stale JSON-LD: ${page.file}`);
    else { writeFileSync(path, next); console.log(`updated ${page.file}`); }
  }
  if (check && stale) process.exit(1);
}
