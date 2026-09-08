// Interactive demo: pick a meal photo → scan → numbers count up → Carbo comments.
import { SCAN_MS, COUNT_MS, countValue, findResult, bubbleText, workingFrameAt } from './demo-core.mjs';

const root = document.getElementById('demo');
if (root) {
  const lang = document.documentElement.lang.startsWith('zh') ? 'zh' : 'en';
  const base = root.dataset.base || '';
  const results = JSON.parse(document.getElementById('demo-data').textContent);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const photo = root.querySelector('.demo__photo');
  const frame = root.querySelector('.demo__frame');
  const name = root.querySelector('.demo__name');
  const meta = root.querySelector('.demo__meta');
  const nums = { carbsG: root.querySelector('[data-num="carbsG"]'), proteinG: root.querySelector('[data-num="proteinG"]'), fatG: root.querySelector('[data-num="fatG"]') };
  const carbo = root.querySelector('.demo__carbo');
  const bubble = root.querySelector('.demo__bubble');
  const working = [0, 1].map((i) => `${base}assets/img/carbo-working-${i}.webp`);
  const idle = `${base}assets/img/carbo-idle-0.webp`;
  [...working, idle].forEach((src) => { const im = new Image(); im.src = src; });
  let token = 0;

  const paint = (r, elapsed) => {
    for (const [k, el] of Object.entries(nums)) el.textContent = countValue(r[k], elapsed);
  };
  const finish = (r) => {
    name.textContent = lang === 'zh' ? r.nameZh : r.nameEn;
    meta.textContent = `${r.portionG} g · ${r.kcal} kcal`;
    bubble.textContent = bubbleText(r, lang);
    carbo.src = idle;
    frame.classList.remove('is-scanning');
  };
  const show = (id) => {
    const r = findResult(results, id);
    const my = ++token;
    photo.src = `${base}${r.photo}`;
    root.querySelectorAll('.demo__thumb').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === r.id)));
    if (reduce) { paint(r, COUNT_MS); finish(r); return; }
    frame.classList.add('is-scanning');
    bubble.textContent = lang === 'zh' ? '让我看看……' : 'Let me look…';
    const t0 = performance.now();
    const tick = (now) => {
      if (my !== token) return;
      const el = now - t0;
      const wf = workingFrameAt(el);
      if (wf >= 0) carbo.src = working[wf];
      if (el < SCAN_MS) { requestAnimationFrame(tick); return; }
      const c = el - SCAN_MS;
      paint(r, c);
      if (c < COUNT_MS) requestAnimationFrame(tick); else finish(r);
    };
    requestAnimationFrame(tick);
  };

  root.querySelectorAll('.demo__thumb').forEach((b) => b.addEventListener('click', () => show(b.dataset.id)));
  // resting state: first meal, fully painted, no animation
  const first = results[0];
  photo.src = `${base}${first.photo}`; paint(first, COUNT_MS); finish(first);
  root.querySelector('.demo__thumb').setAttribute('aria-pressed', 'true');
}
