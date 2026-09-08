#!/usr/bin/env node
// Inserts WORD JOINER (U+2060) between adjacent CJK ideographs so headlines and the hero bubble
// only wrap at punctuation. CLI: node tools/cjk-joiner.mjs zh/index.html […] — rewrites in place.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// URO + Ext A only; Ext B and up live above U+FFFF and would need surrogate-aware iteration.
const CJK = /[一-鿿㐀-䶿]/;
export function joinCjk(s) {
  const clean = s.replace(/⁠/g, '');
  let out = '';
  for (let i = 0; i < clean.length; i += 1) {
    out += clean[i];
    if (i + 1 < clean.length && CJK.test(clean[i]) && CJK.test(clean[i + 1])) out += '⁠';
  }
  return out;
}

// The joiner belongs on the big type only: <h1>/<h2> and the hero .bubble. Tags inside them
// (<br>, <span>) are copied through untouched, so text either side of one is joined separately.
// The class match is exact: \b would also fire on "speech-bubble" and "bubble-tail", since "-" is
// a non-word character and therefore a word boundary.
export function joinHeadings(html) {
  const inner = (s) => s.split(/(<[^>]*>)/).map((x) => (x.startsWith('<') ? x : joinCjk(x))).join('');
  return html
    .replace(/(<(h[12])(?:\s[^>]*)?>)([\s\S]*?)(<\/\2>)/g, (m, open, tag, body, close) => open + inner(body) + close)
    .replace(/(<(\w+)[^>]*\sclass="[^"]*(?<![\w-])bubble(?![\w-])[^"]*"[^>]*>)([\s\S]*?)(<\/\2>)/g, (m, open, tag, body, close) => open + inner(body) + close);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('usage: node tools/cjk-joiner.mjs <page.html> […]'); process.exit(2); }
  for (const f of files) {
    const before = readFileSync(f, 'utf8');
    const after = joinHeadings(before);
    if (after !== before) writeFileSync(f, after);
    console.log(`${after === before ? 'unchanged' : 'joined  '} ${f}`);
  }
}
