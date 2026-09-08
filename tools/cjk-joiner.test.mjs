import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinCjk } from './cjk-joiner.mjs';

test('inserts U+2060 between consecutive CJK characters only', () => {
  assert.equal(joinCjk('拍一张，碳水算清。'), '拍⁠一⁠张，碳⁠水⁠算⁠清。');
});
test('leaves latin, digits and tags alone', () => {
  assert.equal(joinCjk('<h1>Carbo-AI 60 g</h1>'), '<h1>Carbo-AI 60 g</h1>');
});
test('is idempotent', () => {
  const once = joinCjk('三步，然后开饭。');
  assert.equal(joinCjk(once), once);
});
