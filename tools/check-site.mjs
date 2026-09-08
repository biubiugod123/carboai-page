#!/usr/bin/env node
// Static gate for every page carboai.app publishes.
// Usage: node tools/check-site.mjs   → exit 0 clean, 1 findings, 2 usage/config error (as tools/shoot.mjs).
// CHECK_SITE_PAGES replaces the manifest whenever it is *set*: "a.html,b.html:legal", the ":legal"
// suffix marking a legal page. Set but empty is a config error, not a quiet run of the real ten pages.
// House style this relies on: lowercase attribute names; site links relative (no leading "/").
// Quoting is not part of it — href/src, srcset, data-frames, ids and the rel= tags parsed below are
// all read in either quote style; only REQUIRED_HEAD still spells out this site's double-quoted head.
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
// Being set is what makes the override active — falling back to MANIFEST on an empty string would let
// a caller that meant to narrow the run silently check the whole real site instead.
const OVERRIDE = process.env.CHECK_SITE_PAGES;
const PAGES = (OVERRIDE === undefined ? MANIFEST.join(',') : OVERRIDE)
  .split(',').map((s) => s.trim()).filter(Boolean)
  .map((s) => { const [path, kind] = s.split(':'); return { path, legal: kind === 'legal' }; });
// An override of whitespace or bare commas parses to nothing; reporting "0 page(s) clean" would be
// a green run that opened no file at all.
if (!PAGES.length) { console.error('no pages to check'); process.exit(2); }

const SUPPORT = 'mailto:support@carboai.app';
const METABOLISM = 'metabolism wording (site rule: no metabolism claims, not even disclaimers)';
const FORBIDDEN = [
  [/\bCarboAI\b/, 'brand must be written "Carbo-AI"'],
  [/\b(supabase|gemini|revenuecat)\b/i, 'no vendor names'],
  [/google fit/i, 'no Google Fit claim'],
  [/\bmetabolism\b/i, METABOLISM],
  [/\$\s?\d+(\.\d\d)?/, 'no prices on the site'],
  [/free (tier|plan)/i, 'there is no free tier'],
  [/谷歌健身/, 'no Google Fit claim'],
  [/代谢/, METABOLISM],
  [/[￥¥]\s?\d/, 'no prices on the site'],
  // 元 also opens 元旦/元气/元素…, so a digit before it is only a price when no such word follows.
  [/\d+\s*(元|日元)(?![素气旦宵件年数])/, 'no prices on the site'],
  // "免费下载" and "免费试用" are true and must stay legal; a free *tier* is what the site may not promise.
  // Only 版/套餐 follow 免费 here: "免费试用期永久" is not something anyone writes, and the phrase that
  // is — 永久免费试用期 — is already caught by the leading-modifier branch.
  [/(永久|完全|一直|基础.{0,4})免费|免费(版|套餐)/, 'there is no free tier'],
];
// hreflang and canonical are not here: they are read off the parsed <head> below, because their
// presence and their value are the same question and the parse must not care about attribute order.
const REQUIRED_HEAD = [
  [/<html[^>]+lang="(en|zh-Hans)"/, '<html lang>'],
  [/<title>[^<]+<\/title>/, '<title>'],
  [/<meta name="description" content="[^"]+"/, 'meta description'],
  [/<meta property="og:title" content="[^"]+"/, 'og:title'],
  [/<meta property="og:description" content="[^"]+"/, 'og:description'],
  [/<meta property="og:image" content="https:\/\/carboai\.app\/[^"]+"/, 'og:image (absolute URL)'],
  [/<meta name="twitter:card" content="[^"]+"/, 'twitter:card'],
  [/<link rel="icon"/, 'favicon link'],
];

let failures = 0;
const fail = (page, msg) => { failures += 1; console.log(`  ✗ ${page}: ${msg}`); };

// Site URL → the file that serves it: "https://carboai.app/" → index.html, "…/zh/" → zh/index.html.
// A URL that is not on this origin comes back unchanged and simply matches no page.
const fileFor = (url) => {
  const rel = url.replace(/^https:\/\/carboai\.app\//, '');
  return rel === '' || rel.endsWith('/') ? `${rel}index.html` : rel;
};

// Attribute order, quoting and case are the author's business, not the gate's: find a tag by its rel,
// then read each attribute on its own. The single regex this replaced spelled out rel → hreflang →
// href in that order, so `<link rel="alternate" href="…" hreflang="zh-Hans">` parsed as no alternate
// at all: the page lost its return leg silently and its partner was blamed for the missing pair.
// The lookbehind keeps the match on rel= itself — "data-rel" ends in rel, and a script's decoy tag
// would otherwise be read as this page's canonical. attrOf's leading \s does that job for href.
const linkTags = (html, rel) => [...html.matchAll(new RegExp(`<link\\s[^>]*(?<![-\\w])rel=["']${rel}["'][^>]*>`, 'gi'))].map((m) => m[0]);
const attrOf = (tag, name) => tag.match(new RegExp(`\\s${name}=["']([^"']*)["']`, 'i'))?.[1];

// Carries its own protocol guard: the srcset and data-frames loops call it directly.
const checkLocal = (page, url) => {
  if (/^(https?:|mailto:|data:)/.test(url)) return;
  const [path] = url.split(/[#?]/);
  // href="?utm=x" and an empty data-frames entry resolve to the page's own directory, which exists —
  // existsSync would pass them. They are always mistakes.
  if (!path) { fail(page, `empty link ${url}`); return; }
  if (!existsSync(resolve(dirname(join(ROOT, page)), path))) fail(page, `broken link ${url}`);
};

const heads = new Map(); // marketing page → { canonical, alts } for the hreflang reciprocity pass
const noindex = new Set(); // pages that ask search engines to skip them — they must stay out of sitemap.xml

for (const { path: page, legal } of PAGES) {
  if (!existsSync(join(ROOT, page))) { fail('(site)', `missing page: ${page}`); continue; }
  const html = readFileSync(join(ROOT, page), 'utf8');
  const text = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  for (const [re, why] of FORBIDDEN) {
    const m = text.match(re);
    if (m) fail(page, `${why} (found "${m[0]}")`);
  }
  if (!legal) for (const [re, what] of REQUIRED_HEAD) if (!re.test(html)) fail(page, `missing ${what}`);
  if (!legal) {
    const canonical = attrOf(linkTags(html, 'canonical')[0] ?? '', 'href') ?? '';
    // A rel="alternate" without both attributes is some other kind of alternate (an RSS feed, say).
    const alts = linkTags(html, 'alternate')
      // hreflang is case-insensitive: normalise here, once, so "X-Default" cannot slip past the
      // x-default rules below by spelling itself differently. Findings quote the normalised tag.
      .map((tag) => ({ lang: attrOf(tag, 'hreflang')?.toLowerCase(), href: attrOf(tag, 'href') }))
      .filter((a) => a.lang && a.href);
    if (!alts.length) fail(page, 'missing hreflang');
    if (!/^https:\/\/carboai\.app\//.test(canonical)) fail(page, 'missing canonical');
    heads.set(page, { canonical, alts });
  }
  // robots is a directive list, not a string: read the tag, then look for the directive inside its
  // content, so "noindex, nofollow", NOINDEX and the none shorthand all land the same way.
  for (const [tag] of html.matchAll(/<meta\s[^>]*name=["']robots["'][^>]*>/gi)) {
    if (/\b(noindex|none)\b/i.test(attrOf(tag, 'content') ?? '')) noindex.add(page);
  }
  if (/href=["']#["']/.test(html)) fail(page, 'dead href="#"');
  // One wrong letter in the support address is the costliest single-character typo on the site.
  for (const m of html.matchAll(/mailto:[^"'\s>]+/g)) if (m[0].split('?')[0] !== SUPPORT) fail(page, `wrong support address ${m[0]}`);
  const ids = new Set([...html.matchAll(/\sid=["']([^"']+)["']/g)].map((m) => m[1]));
  for (const m of html.matchAll(/(?:href|src)=["']([^"']+)["']/g)) {
    const url = m[1];
    if (url === '#') continue; // already reported above
    if (url.startsWith('#')) { if (!ids.has(url.slice(1))) fail(page, `anchor ${url} not found`); continue; }
    checkLocal(page, url);
  }
  // Candidates are comma-separated, but a data: URI carries commas of its own — match whole candidates.
  for (const m of html.matchAll(/srcset=["']([^"']+)["']/g)) {
    for (const c of m[1].matchAll(/(?:data:\S+|[^\s,]+)(?:\s+[^\s,]+)?/g)) checkLocal(page, c[0].split(/\s+/)[0]);
  }
  for (const m of html.matchAll(/data-frames=["']([^"']*)["']/g)) {
    for (const frame of m[1].split(',')) checkLocal(page, frame.trim());
  }
  // Selected by content, not by path: any Chinese marketing page must have run through the joiner.
  if (!legal && /<html[^>]*\slang="zh/i.test(html) && joinHeadings(html) !== html) {
    fail(page, 'heading/bubble text not run through tools/cjk-joiner.mjs');
  }
}

// hreflang is a promise in both directions: Google drops a pair where the other page does not name
// this one back. x-default nominates the fallback rather than a locale, so it neither owes a return
// leg nor supplies one — a page whose only inbound link is the fallback's x-default is still orphaned.
const known = new Set(PAGES.map((p) => p.path));
// A legal page carries no hreflang of its own, so it can be a page an alternate names but never the
// counterpart the pair rule looks for: naming one leaves the marketing page as orphaned as before.
const marketing = new Set(PAGES.filter((p) => !p.legal).map((p) => p.path));
for (const [page, { canonical, alts }] of heads) {
  // The zh/ tree only exists to be reached: a marketing page that names no counterpart is a
  // translation nobody linked, and nothing on the page itself shows the omission.
  if (!alts.some((a) => a.lang !== 'x-default' && marketing.has(fileFor(a.href)) && fileFor(a.href) !== page)) {
    fail(page, 'no alternate-language page declared');
  }
  for (const { lang, href } of alts) {
    const target = fileFor(href);
    if (!known.has(target)) { fail(page, `hreflang ${lang} → ${href} is not a page in the manifest`); continue; }
    // With no canonical there is nothing for the other page to point back at — already reported above.
    if (lang === 'x-default' || !canonical) continue;
    if (!heads.get(target)?.alts.some((a) => a.lang !== 'x-default' && a.href === canonical)) fail(page, `hreflang ${lang} → ${target} has no alternate back`);
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
    const file = fileFor(loc);
    listed.add(file);
    if (!existsSync(join(ROOT, file))) fail('sitemap.xml', `<loc> ${loc} has no file (${file})`);
  }
  // noindex and a sitemap entry ask search engines for opposite things; a thin page in progress is
  // noindex and stays out of the sitemap until it is finished.
  for (const page of noindex) if (listed.has(page)) fail('sitemap.xml', `${page} is noindex and must not be listed`);
  for (const { path } of PAGES) if (!listed.has(path) && !noindex.has(path)) fail('sitemap.xml', `missing <loc> for ${path}`);
}

console.log(failures ? `\n${failures} problem(s)` : `\nOK — ${PAGES.length} page(s) clean`);
process.exit(failures ? 1 : 0);
