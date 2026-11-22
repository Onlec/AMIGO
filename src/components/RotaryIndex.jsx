import React, { useEffect, useRef } from 'react';

const CATEGORY_COLORS = {
  Calculate: '#A83232',
  Planner: '#171A19',
  Convert: '#174F78',
  Organize: '#D4AA37',
};

// Deze interactie is sterk imperatief (3D-transforms per frame, drag-
// physics, toetsenbordnavigatie) — dat leent zich beter voor een eigen,
// door React ongemoeid gelaten DOM-subboompje dan voor idiomatische
// React-state. We bouwen daarom de kaarten/tabs zelf op in een effect
// (net als het origineel), i.p.v. elke kaart als JSX te renderen.
export default function RotaryIndex({ items }) {
  const sceneRef = useRef(null);
  const wheelRef = useRef(null);
  const tabsRef = useRef(null);
  const railLeftRef = useRef(null);
  const railRightRef = useRef(null);
  const noRef = useRef(null);
  const liveRef = useRef(null);
  const winRef = useRef(null);
  const winBodyRef = useRef(null);
  const closeBtnRef = useRef(null);

  useEffect(() => {
    const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const n = items.length;
    const SL = [0, 1, 2, 1];
    const scene = sceneRef.current;
    const wheel = wheelRef.current;
    const tabsEl = tabsRef.current;
    const rl = railLeftRef.current;
    const rr = railRightRef.current;
    const noEl = noRef.current;
    const liveEl = liveRef.current;
    const win = winRef.current;
    const winBody = winBodyRef.current;
    const closeBtn = closeBtnRef.current;

    // ---- kaarten opbouwen ----
    const cards = [];
    items.forEach((item, i) => {
      const num = String(i + 1).padStart(2, '0');
      const c = document.createElement('div');
      c.className = 'cd';
      c.id = `cd${i}`;
      c.setAttribute('role', 'option');
      const cc = CATEGORY_COLORS[item.category] || CATEGORY_COLORS.Planner;
      c.style.cssText = `--cc:${cc};--s:${SL[i % 4]}`;
      c.innerHTML = `<div class="fc"><span class="tab"></span><div class="in"><div class="meta lab"><span>${num} / ${n}</span><span>REF. AMG-${item.letter}-${num}</span></div><div class="ttl"><h3>${item.title}</h3><span class="sub lab">AMIGO ${item.category} · Tool</span></div><p>${item.blurb}</p></div></div><div class="bk"><span class="tab"></span></div>`;
      c.onclick = () => (idx() === i ? openWin(i) : goIdx(i));
      wheel.appendChild(c);
      c._f = [c.querySelector('.fc'), c.querySelector('.bk')];
      cards.push(c);
    });

    // ---- letter-tabs ----
    const tb = {};
    items.forEach((item, i) => {
      if (tb[item.letter] === undefined) {
        tb[item.letter] = i;
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = item.letter;
        b.setAttribute('aria-label', `Ga naar ${item.letter}`);
        b.onclick = () => goIdx(i, true);
        tabsEl.appendChild(b);
      }
    });

    // ---- tellerwerk voor "actieve kaart NN" ----
    function makeCounter(el) {
      let len = -1;
      let strips = [];
      return {
        set(s) {
          if (s.length !== len) {
            el.innerHTML = '';
            strips = [];
            len = s.length;
            for (let i = 0; i < s.length; i += 1) {
              const ch = s[i];
              if (/\d/.test(ch)) {
                const o = document.createElement('span');
                o.className = 'od';
                const st = document.createElement('span');
                st.className = 'st';
                for (let d = 0; d < 10; d += 1) {
                  const t = document.createElement('i');
                  t.textContent = String(d);
                  st.appendChild(t);
                }
                o.appendChild(st);
                el.appendChild(o);
                strips.push([st, i]);
              } else {
                const p = document.createElement('span');
                p.className = 'sp';
                p.textContent = ch;
                el.appendChild(p);
              }
            }
          }
          const go = () => {
            strips.forEach(([st, i]) => {
              st.style.transform = `translateY(-${Number(s[i]) * 1.1}em)`;
            });
          };
          if (RM) go();
          else requestAnimationFrame(() => requestAnimationFrame(go));
        },
      };
    }
    const no = makeCounter(noEl);

    let pos = Math.floor(n / 2);
    let vel = 0;
    let tw = null;
    let drag = null;
    let run = false;
    let cur = -1;

    function wrap(x) {
      return (((x + n / 2) % n) + n) % n - n / 2;
    }
    function idx() {
      return ((Math.round(pos) % n) + n) % n;
    }
    function goIdx(i, f) {
      const r = Math.round(pos);
      goTo(r + wrap(i - r), f);
    }
    function render() {
      cards.forEach((c, i) => {
        const d = wrap(i - pos);
        let tf;
        let op = 1;
        if (d < -3 || d >= 3) {
          c.style.display = 'none';
          return;
        }
        if (d >= 0) {
          tf = `translateZ(${-9 * d}px)`;
          op = d > 2 ? 3 - d : 1;
        } else if (d > -1) {
          const t = -d;
          tf = `rotateX(${-82 * t}deg) translateZ(${-8 * t}px)`;
        } else {
          const m = 4 * Math.min(1, -d - 1);
          tf = `rotateX(-82deg) translateY(${m}px) translateZ(${-4 * (d + 3)}px)`;
          op = d > -2 ? 1 : 3 + d;
        }
        c.style.display = 'block';
        c.style.transform = tf;
        const fr = d > -0.57;
        c._f[0].style.opacity = String(op);
        c._f[1].style.opacity = String(op);
        c._f[0].style.visibility = fr ? 'visible' : 'hidden';
        c._f[1].style.visibility = fr ? 'hidden' : 'visible';
        c.style.pointerEvents = op < 0.5 ? 'none' : '';
        const on = idx() === i;
        c.classList.toggle('on', on);
        c.setAttribute('aria-selected', String(on));
      });
      const y = `${17 + pos * 40}px`;
      rl.style.backgroundPositionY = y;
      rr.style.backgroundPositionY = y;
      const r = idx();
      if (r !== cur) {
        cur = r;
        no.set(String(r + 1).padStart(2, '0'));
        scene.setAttribute('aria-activedescendant', `cd${r}`);
        liveEl.textContent = `${items[r].title}, kaart ${r + 1} van ${n}`;
        Array.from(tabsEl.children).forEach((b) => {
          b.classList.toggle('on', b.textContent === items[r].letter);
        });
      }
    }
    function ease(k) {
      return k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
    }
    function goTo(i, fast) {
      vel = 0;
      const dist = Math.abs(i - pos);
      if (RM) {
        pos = i;
        render();
        return;
      }
      tw = { from: pos, to: i, t0: performance.now(), dur: Math.min(800, Math.max(fast ? 400 : 250, dist * 70)) };
      kick();
    }
    function kick() {
      if (!run) {
        run = true;
        requestAnimationFrame(loop);
      }
    }
    function loop(t) {
      if (tw) {
        const k = (t - tw.t0) / tw.dur;
        if (k >= 1) {
          pos = tw.to;
          tw = null;
        } else {
          pos = tw.from + (tw.to - tw.from) * ease(k);
        }
      } else if (!drag) {
        if (Math.abs(vel) > 0.004) {
          pos += vel;
          vel *= 0.93;
        } else {
          vel = 0;
          if (Math.abs(pos - Math.round(pos)) > 0.001) goTo(Math.round(pos));
        }
      }
      render();
      if (tw || drag || Math.abs(vel) > 0.004 || Math.abs(pos - Math.round(pos)) > 0.001) {
        requestAnimationFrame(loop);
      } else {
        run = false;
      }
    }

    function onWheelEvt(e) {
      e.preventDefault();
      if (RM) {
        goTo(Math.round(pos) + (e.deltaY > 0 ? 1 : -1));
        return;
      }
      tw = null;
      vel = Math.max(-0.5, Math.min(0.5, vel + e.deltaY * 0.0007));
      kick();
    }
    function onPointerDown(e) {
      if (e.button > 0) return;
      tw = null;
      vel = 0;
      drag = { y: e.clientY, p: pos, moved: false, id: e.pointerId };
      kick();
    }
    function onPointerMove(e) {
      if (!drag) return;
      const dy = e.clientY - drag.y;
      if (Math.abs(dy) > 5 && !drag.moved) {
        drag.moved = true;
        try {
          scene.setPointerCapture(drag.id);
        } catch (err) {
          /* negeerbaar: pointer al losgelaten */
        }
      }
      const np = drag.p + dy / 52;
      vel = (np - pos) * 0.6;
      pos = np;
    }
    function stopClick(e) {
      e.stopPropagation();
    }
    function onPointerUp() {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      if (moved) scene.addEventListener('click', stopClick, { capture: true, once: true });
      if (RM) goTo(Math.round(pos));
      kick();
    }
    function onKeyDown(e) {
      const r = Math.round(pos);
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        goTo(r - 1);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        goTo(r + 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        goIdx(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        goIdx(n - 1);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openWin(idx());
      }
    }

    function openWin(i) {
      const item = items[i];
      winBody.innerHTML = `<div class="lab" style="color:#555B55">Kaart ${String(i + 1).padStart(2, '0')} / ${n}</div><h3>${item.title}</h3><p style="margin:0;color:#555B55">${item.blurb}</p><dl><dt>Afdeling</dt><dd>AMIGO ${item.category}</dd><dt>Index</dt><dd>${item.letter}</dd><dt>Status</dt><dd>${item.live ? 'Beschikbaar' : 'Voorbeeldkaart'}</dd></dl>${
        item.live
          ? `<a class="btn red" href="${item.href}">Open tool</a>`
          : '<p style="font-size:.85rem;color:#555B55;margin:0">Nog niet uitgewerkt in dit prototype.</p>'
      }`;
      win.classList.add('open');
      closeBtn.focus();
    }
    function closeWin() {
      win.classList.remove('open');
      scene.focus();
    }
    function onEscape(e) {
      if (e.key === 'Escape' && win.classList.contains('open')) closeWin();
    }

    scene.addEventListener('wheel', onWheelEvt, { passive: false });
    scene.addEventListener('pointerdown', onPointerDown);
    scene.addEventListener('pointermove', onPointerMove);
    scene.addEventListener('pointerup', onPointerUp);
    scene.addEventListener('keydown', onKeyDown);
    closeBtn.addEventListener('click', closeWin);
    document.addEventListener('keydown', onEscape);

    render();

    return () => {
      scene.removeEventListener('wheel', onWheelEvt);
      scene.removeEventListener('pointerdown', onPointerDown);
      scene.removeEventListener('pointermove', onPointerMove);
      scene.removeEventListener('pointerup', onPointerUp);
      scene.removeEventListener('keydown', onKeyDown);
      closeBtn.removeEventListener('click', closeWin);
      document.removeEventListener('keydown', onEscape);
      wheel.innerHTML = '';
      tabsEl.innerHTML = '';
    };
  }, [items]);

  return (
    <div className="stage">
      <div className="ix">
        <div className="scene" ref={sceneRef} tabIndex={0} role="listbox" aria-label="Toolindex">
          <i className="rail l" ref={railLeftRef} />
          <i className="rail r" ref={railRightRef} />
          <div className="wheel" ref={wheelRef} />
        </div>
        <div className="tabs" ref={tabsRef} aria-label="Letters" />
      </div>
      <aside className="win" ref={winRef} role="dialog" aria-label="Details">
        <div className="bar">
          <span className="lab">Kaartdetails</span>
          <button type="button" ref={closeBtnRef} aria-label="Sluiten">
            ×
          </button>
        </div>
        <div className="body" ref={winBodyRef} />
      </aside>
      <div className="ixbar">
        <span className="lab">
          Actieve kaart <b ref={noRef} style={{ marginLeft: '10px' }} />{' '}
          <b style={{ color: '#6C726D' }}>/ {items.length}</b>
        </span>
        <span className="lab">Klik op de voorste kaart of druk op Enter. Esc sluit.</span>
      </div>
      <p ref={liveRef} aria-live="polite" style={{ position: 'absolute', left: '-9999px' }} />
    </div>
  );
}
