import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countValue, findResult, bubbleText, workingFrameAt, SCAN_MS } from '../assets/demo-core.mjs';

const results = [
  { id: 'a', carbsG: 62, fitEn: 'A en', fitZh: 'A zh' },
  { id: 'b', carbsG: 10, fitEn: 'B en', fitZh: 'B zh' },
];

test('countValue eases from 0 to target and clamps', () => {
  assert.equal(countValue(62, 0), 0);
  assert.equal(countValue(62, 600), 62);
  assert.equal(countValue(62, 9999), 62);
  const mid = countValue(62, 300);
  assert.ok(mid > 31 && mid < 62, `ease-out should be past halfway at t=0.5, got ${mid}`);
});
test('findResult falls back to the first entry', () => {
  assert.equal(findResult(results, 'b').carbsG, 10);
  assert.equal(findResult(results, 'nope').id, 'a');
});
test('bubbleText picks the language', () => {
  assert.equal(bubbleText(results[0], 'zh'), 'A zh');
  assert.equal(bubbleText(results[0], 'en'), 'A en');
});
test('workingFrameAt shows frame 0 then 1 during the scan, idle after', () => {
  assert.equal(workingFrameAt(0), 0);
  assert.equal(workingFrameAt(SCAN_MS / 2 + 1), 1);
  assert.equal(workingFrameAt(SCAN_MS), -1);
});
