// Carbo-AI site behaviour. Every effect respects prefers-reduced-motion; the page is complete without JS.
(() => {
  clearTimeout(window.__jsGuard); // the inline head script drops the js class after 1.5 s if this file never runs
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const list = (el, key) => (el.dataset[key] || '').split(',').map((x) => x.trim()).filter(Boolean);
  const preload = (srcs) => srcs.forEach((src) => { const i = new Image(); i.src = src; });
  // Show frames[i] for durations[i] ms each; call `then` after the last one.
  const play = (img, frames, durations, then) => {
    let i = 0;
    const step = () => { img.src = frames[i]; const d = durations[i] ?? 160; if (i < frames.length - 1) { i += 1; setTimeout(step, d); } else if (then) setTimeout(then, d); };
    step();
  };

  // 1. Headline: wrap words so motion.css can stagger them (skipped under reduced motion — then CSS never hides them)
  const h1 = document.querySelector('.hero h1');
  if (h1 && !reduce) {
    let n = 0;
    const wrap = (node) => {
      [...node.childNodes].forEach((c) => {
        if (c.nodeType === 3) {
          const frag = document.createDocumentFragment();
          c.textContent.split(/(\s+)/).forEach((t) => {
            if (!t) return;
            if (/^\s+$/.test(t)) { frag.appendChild(document.createTextNode(t)); return; }
            const w = document.createElement('span'); w.className = 'w'; w.style.setProperty('--i', n); n += 1; w.textContent = t; frag.appendChild(w);
          });
          c.replaceWith(frag);
        } else if (c.nodeType === 1 && c.tagName !== 'BR') wrap(c);
      });
    };
    wrap(h1);
  }

  // 2. Hero Carbo: wave once after the page has loaded (frames are fetched then, not with the LCP), then idle —
  //    breathing is CSS, blinking mirrors the app (5 s / 8 s, 120 ms)
  const carbo = document.getElementById('hero-carbo');
  const bubble = document.querySelector('.stage .bubble');
  if (carbo) {
    const idle = list(carbo, 'idle'); const wave = list(carbo, 'wave');
    const blink = () => {
      const seq = [[idle[0], 5000], [idle[1], 120], [idle[0], 8000], [idle[1], 120]];
      let i = 0;
      const tick = () => { carbo.src = seq[i][0]; setTimeout(tick, seq[i][1]); i = (i + 1) % seq.length; };
      tick();
    };
    if (reduce || wave.length < 2 || idle.length < 2) { bubble?.classList.add('is-in'); }
    else {
      const start = () => { preload([...wave, idle[1]]); setTimeout(() => play(carbo, wave, [150, 180, 220, 320], () => { carbo.src = idle[0]; bubble?.classList.add('is-in'); blink(); }), 400); };
      if (document.readyState === 'complete') start(); else window.addEventListener('load', start, { once: true });
    }
  }

  // 3. Reveal on scroll; --i = index among sibling .reveal elements (motion.css turns it into a stagger)
  const observed = [...document.querySelectorAll('.reveal, [data-observe]')];
  observed.forEach((el) => {
    if (!el.classList.contains('reveal')) return;
    const sibs = [...el.parentElement.children].filter((c) => c.classList.contains('reveal'));
    el.style.setProperty('--i', sibs.indexOf(el));
  });
  if (reduce || !('IntersectionObserver' in window)) observed.forEach((el) => el.classList.add('is-visible'));
  else {
    const io = new IntersectionObserver((entries) => { for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); } }, { rootMargin: '0px 0px -10% 0px' });
    observed.forEach((el) => io.observe(el));
  }

  // 4. Week dots: index for the pop stagger
  document.querySelectorAll('.week__strip .week__dot').forEach((d, i) => d.style.setProperty('--i', i));

  // 5. Emotion strip: each tile plays its frames when half of it is in view. Looping tiles keep going;
  //    one-shot tiles (waving, failed) replay every time they re-enter the viewport or are hovered/tapped.
  const tiles = document.querySelectorAll('.emotion img[data-frames]');
  if (tiles.length && !reduce && 'IntersectionObserver' in window) {
    const state = new WeakMap(); // img → { playing, started }
    const start = (img) => {
      const st = state.get(img) || {}; if (st.playing) return;
      const frames = list(img, 'frames'); const durations = list(img, 'durations').map(Number);
      const loop = img.dataset.loop === 'true';
      st.playing = true; state.set(img, st);
      const run = () => play(img, frames, durations, () => { if (loop && st.playing) run(); else { st.playing = false; } });
      preload(frames); setTimeout(run, st.started ? 0 : 200); st.started = true;
    };
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const st = state.get(e.target) || {};
        if (e.isIntersecting) start(e.target);
        else if (e.target.dataset.loop === 'true') { st.playing = false; state.set(e.target, st); } // pause loops off-screen
      }
    }, { threshold: 0.5 });
    tiles.forEach((t) => { io.observe(t); t.closest('.emotion')?.addEventListener('mouseenter', () => start(t)); t.closest('.emotion')?.addEventListener('click', () => start(t)); });
  }

  // 6. FAQ: only one open at a time
  const faq = document.querySelector('.faq');
  if (faq) faq.addEventListener('toggle', (e) => { if (e.target.open) faq.querySelectorAll('details[open]').forEach((d) => { if (d !== e.target) d.open = false; }); }, true);

  // 7. Closing band: wave once when it scrolls into view
  const wave = document.getElementById('wave');
  if (wave && !reduce && 'IntersectionObserver' in window) {
    const frames = list(wave, 'frames'); const durations = list(wave, 'durations').map(Number);
    preload(frames);
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { io.disconnect(); play(wave, frames, durations); } }, { threshold: 0.4 });
    io.observe(wave);
  }
})();
