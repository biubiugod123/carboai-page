#!/usr/bin/env node
// Run: node --test 'tools/**/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PAGES, ROOT, faqOf, inject } from './jsonld.mjs';

const blocksOf = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const stripScripts = (html) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '');

for (const page of PAGES) {
  const html = readFileSync(join(ROOT, page.file), 'utf8');
  test(`${page.file}: JSON-LD is current and mirrors the visible FAQ`, () => {
    assert.equal(inject(page, html), html, 'run node tools/jsonld.mjs');
    const blocks = blocksOf(html);
    assert.equal(blocks.length, 1);
    const faq = blocks[0]['@graph'].find((n) => n['@type'] === 'FAQPage');
    assert.equal(faq.mainEntity.length, (stripScripts(html).match(/<details[ >]/g) || []).length);
    const visible = stripScripts(html).replace(/<[^>]+>/g, '').replace(/⁠/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'");
    for (const q of faq.mainEntity) {
      assert.ok(visible.includes(q.name), `question on page: ${q.name}`);
      for (const line of q.acceptedAnswer.text.split('\n')) assert.ok(visible.includes(line.replace(/^- /, '')), `answer on page: ${line}`);
    }
    const app = blocks[0]['@graph'].find((n) => n['@type'] === 'SoftwareApplication');
    assert.equal(Boolean(app), Boolean(page.app));
  });
}

test('faqOf strips markup and keeps list items as lines', () => {
  const faq = faqOf('<details><summary><h2>Q &amp; A?</h2></summary><ol><li>One <strong>two</strong></li><li>Three</li></ol><p>Tail.</p></details>');
  assert.deepEqual(faq, [{ '@type': 'Question', name: 'Q & A?', acceptedAnswer: { '@type': 'Answer', text: '- One two\n- Three\nTail.' } }]);
});
