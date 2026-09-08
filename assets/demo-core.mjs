// Pure helpers for the interactive demo. No DOM here so node:test can cover it.
export const SCAN_MS = 2000;
export const COUNT_MS = 600;
export const easeOutCubic = (t) => 1 - (1 - t) ** 3;
export function countValue(target, elapsedMs, durationMs = COUNT_MS) {
  const t = Math.min(1, Math.max(0, elapsedMs / durationMs));
  return Math.round(target * easeOutCubic(t));
}
export function findResult(results, id) {
  return results.find((r) => r.id === id) ?? results[0];
}
export function bubbleText(result, lang) {
  return lang === 'zh' ? result.fitZh : result.fitEn;
}
// Two working frames across the scan (the app's full 6-frame cycle is 9.6 s — too slow for a 2 s scan). -1 = idle.
export function workingFrameAt(elapsedMs) {
  if (elapsedMs >= SCAN_MS) return -1;
  return elapsedMs < SCAN_MS / 2 ? 0 : 1;
}
