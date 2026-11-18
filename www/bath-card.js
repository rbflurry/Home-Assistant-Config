/*
 * bath-card.js — "Bath Time!" celebration for Home Assistant
 * A button card. Tap it and a ~10 second animation plays over the whole dashboard:
 * a bathtub slides up, a shower head rains into it, bubbles float up and pop,
 * a rubber duck bobs in the foam, and a bouncy "Bath Time!" title pops in.
 *
 * Install: copy to /config/www/bath-card.js, add resource /local/bath-card.js (JavaScript module),
 * then add a card:   type: custom:bath-card
 *
 * Optional: set `entity` to an input_button (or input_boolean). Tapping presses it, and every
 * dashboard showing this card (wall tablet, phones) celebrates when it changes, so you can
 * also kick it off from Node-RED or an automation.
 */
(() => {
  const DEFAULTS = {
    name: 'Bath Time',     // button label
    icon: '🛁',            // button icon (emoji)
    title: 'Bath Time!',   // big animated title
    subtitle: '',          // optional smaller line under the title
    duration: 10,          // seconds
    bubbles: 1,            // bubble amount multiplier
    shower: true,
    duck: true,
    show_button: true,     // false = invisible card that only reacts to `entity`
    entity: null,
    z_index: 9,
  };

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const easeOutBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const easeIn = (x) => x * x;

  let bubbleImg = null;
  function bubbleSprite() {
    if (bubbleImg) return bubbleImg;
    const S = 128, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d'), r = 60;
    const grad = g.createRadialGradient(64, 64, r * 0.5, 64, 64, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.03)');
    grad.addColorStop(0.75, 'rgba(180,230,255,0.2)');
    grad.addColorStop(0.92, 'rgba(255,190,240,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0.85)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(64, 64, r, 0, 6.283); g.fill();
    if (g.createConicGradient) { // soap-film rainbow sheen
      const cg = g.createConicGradient(0, 64, 64);
      ['rgba(255,120,200,.35)', 'rgba(120,200,255,.35)', 'rgba(140,255,180,.35)', 'rgba(255,230,120,.35)', 'rgba(255,120,200,.35)']
        .forEach((col, i, a) => cg.addColorStop(i / (a.length - 1), col));
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = cg;
      g.beginPath(); g.arc(64, 64, r, 0, 6.283); g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath(); g.ellipse(42, 38, 15, 8, -0.7, 0, 6.283); g.fill();
    g.beginPath(); g.arc(30, 56, 3.5, 0, 6.283); g.fill();
    bubbleImg = c;
    return c;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  class BathShow {
    constructor(cfg, onDone) {
      this.cfg = cfg;
      this.onDone = onDone;
      this.bubbles = [];
      this.drops = [];
      this.splash = [];
      this.t = 0;
      this.bAcc = 0;
      this.dAcc = 0;
      this.loop = this.loop.bind(this);
      this.onResize = this.resize.bind(this);
      this.img = bubbleSprite();
    }

    start() {
      const c = document.createElement('canvas');
      Object.assign(c.style, {
        position: 'fixed', left: '0', top: '0', width: '100vw', height: '100vh',
        pointerEvents: 'none', zIndex: this.cfg.z_index,
      });
      document.body.appendChild(c);
      this.canvas = c;
      this.ctx = c.getContext('2d');
      window.addEventListener('resize', this.onResize);
      this.resize();
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.loop);
    }

    stop() {
      cancelAnimationFrame(this.raf);
      window.removeEventListener('resize', this.onResize);
      this.canvas && this.canvas.remove();
      this.canvas = null;
      this.onDone && this.onDone();
    }

    resize() {
      this.dpr = window.devicePixelRatio || 1;
      this.W = window.innerWidth;
      this.H = window.innerHeight;
      this.canvas.width = Math.round(this.W * this.dpr);
      this.canvas.height = Math.round(this.H * this.dpr);
      this.tw = Math.min(this.W * 0.6, 560);
      this.th = this.tw * 0.36;
      this.tx = this.W / 2;
      this.foam = [];
      for (let row = 0; row < 2; row++) {
        const n = 16;
        for (let i = 0; i < n; i++) {
          this.foam.push({
            row,
            x: (i / (n - 1) - 0.5) * this.tw * 0.95 + rand(-6, 6),
            y: (row === 0 ? -0.05 : 0.0) * this.tw + rand(-6, 4),
            r: this.tw * rand(0.045, 0.08) * (row === 0 ? 1 : 0.85),
            ph: rand(0, 6.28),
          });
        }
      }
    }

    tubOffset() {
      const t = this.t, D = this.cfg.duration, drop = this.th + 90;
      let off = (1 - easeOutBack(clamp01(t / 0.9))) * drop;
      if (t > D - 1.1) off += easeIn(clamp01((t - (D - 1.1)) / 1)) * drop;
      return off;
    }

    rimY() { return this.H - 26 - this.th + this.tubOffset(); }

    showerHead() {
      const t = this.t, D = this.cfg.duration;
      let off = (1 - easeOutBack(clamp01((t - 0.2) / 0.7))) * -220;
      if (t > D - 1.4) off -= easeIn(clamp01((t - (D - 1.4)) / 1)) * 260;
      return { x: this.tx + this.tw * 0.2, y: Math.max(80, this.H * 0.13) + off };
    }

    loop(now) {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.t += dt;
      if (this.t >= this.cfg.duration) return this.stop();
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(this.loop);
    }

    spawnBubble(fromTub) {
      const r = rand(8, 38) * Math.min(1.3, Math.max(0.7, this.tw / 450));
      const x = fromTub ? this.tx + rand(-0.45, 0.45) * this.tw : rand(0, this.W);
      const y = fromTub ? this.rimY() - 10 : this.H + r;
      this.bubbles.push({
        x, y, r,
        vy: -rand(40, 130) * (fromTub ? 1.3 : 1),
        vx: rand(-25, 25),
        wobA: rand(10, 30), wobF: rand(1, 2.5), ph: rand(0, 6.28),
        age: 0, life: rand(2.5, 6.5), pop: -1,
      });
    }

    update(dt) {
      const c = this.cfg, D = c.duration, t = this.t, W = this.W, H = this.H;

      // bubbles
      if (t > 0.6 && t < D - 1.8) {
        this.bAcc += 22 * c.bubbles * dt;
        if (!this.burst && t > 0.85) { this.burst = true; for (let i = 0; i < 24 * c.bubbles; i++) this.spawnBubble(true); }
        while (this.bAcc >= 1) { this.bAcc -= 1; this.spawnBubble(Math.random() < 0.6); }
      }
      const endPop = D - 1.3;
      for (let i = this.bubbles.length - 1; i >= 0; i--) {
        const b = this.bubbles[i];
        b.age += dt;
        if (b.pop >= 0) {
          b.pop += dt;
          if (b.pop > 0.28) this.bubbles.splice(i, 1);
          continue;
        }
        b.ph += b.wobF * dt;
        b.y += b.vy * dt;
        b.x += (b.vx + Math.cos(b.ph) * b.wobA) * dt;
        if (t > endPop && !b.endAt) b.endAt = rand(endPop, D - 0.45);
        if (b.age > b.life || b.y < -b.r || (b.endAt && t > b.endAt)) b.pop = 0;
      }

      // shower
      const sh = this.showerHead(), rim = this.rimY();
      if (c.shower && t > 0.7 && t < D - 1.8) {
        this.dAcc += 140 * dt;
        while (this.dAcc >= 1) {
          this.dAcc -= 1;
          this.drops.push({ x: sh.x + rand(-28, 28), y: sh.y + 12, vx: rand(-50, 50), vy: rand(250, 380) });
        }
      }
      for (let i = this.drops.length - 1; i >= 0; i--) {
        const d = this.drops[i];
        d.vy += 900 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        const inTub = Math.abs(d.x - this.tx) < this.tw / 2;
        if ((inTub && d.y > rim - 14) || d.y > H) {
          if (inTub && Math.random() < 0.5) {
            this.splash.push({ x: d.x, y: rim - 14, vx: rand(-80, 80), vy: -rand(80, 200), life: 0 });
          }
          this.drops.splice(i, 1);
        }
      }
      for (let i = this.splash.length - 1; i >= 0; i--) {
        const s = this.splash[i];
        s.life += dt;
        s.vy += 700 * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.life > 0.45) this.splash.splice(i, 1);
      }
    }

    draw() {
      const ctx = this.ctx, d = this.dpr, c = this.cfg, t = this.t, D = c.duration, W = this.W, H = this.H;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      const fade = Math.min(clamp01(t / 0.5), clamp01((D - t) / 0.6));

      // soft bathroom-blue wash
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, `rgba(120,200,255,${0.22 * fade})`);
      bg.addColorStop(1, `rgba(60,140,230,${0.32 * fade})`);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      if (c.shower) this.drawShower();
      this.drawTub();

      // water drops + splashes
      ctx.strokeStyle = 'rgba(170,220,255,0.75)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const dr of this.drops) {
        ctx.moveTo(dr.x, dr.y);
        ctx.lineTo(dr.x - dr.vx * 0.025, dr.y - dr.vy * 0.025);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(200,235,255,0.8)';
      for (const s of this.splash) {
        ctx.globalAlpha = 1 - s.life / 0.45;
        ctx.beginPath(); ctx.arc(s.x, s.y, 2, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;

      this.drawTitle();

      // bubbles on top of everything
      for (const b of this.bubbles) {
        if (b.pop >= 0) {
          const p = b.pop / 0.28;
          ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - p)})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (1 + p * 0.5), 0, 6.283); ctx.stroke();
          ctx.fillStyle = `rgba(255,255,255,${1 - p})`;
          for (let k = 0; k < 6; k++) {
            const a = k * 1.047 + b.ph;
            ctx.beginPath(); ctx.arc(b.x + Math.cos(a) * b.r * (1 + p), b.y + Math.sin(a) * b.r * (1 + p), 1.6, 0, 6.283); ctx.fill();
          }
        } else {
          const s = 1 + Math.sin(b.ph * 2) * 0.04;
          ctx.drawImage(this.img, b.x - b.r * s, b.y - b.r / s, b.r * 2 * s, b.r * 2 / s);
        }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    drawShower() {
      const ctx = this.ctx, sh = this.showerHead();
      const px = sh.x + 70;
      const chrome = (w) => {
        ctx.strokeStyle = '#b8c4cc';
        ctx.lineWidth = w;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      };
      chrome(12);
      ctx.beginPath();
      ctx.moveTo(px, -20);
      ctx.lineTo(px, sh.y - 40);
      ctx.quadraticCurveTo(px, sh.y - 22, sh.x + 10, sh.y - 18);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px - 3, -20);
      ctx.lineTo(px - 3, sh.y - 42);
      ctx.stroke();
      // head
      const g = ctx.createLinearGradient(sh.x - 40, 0, sh.x + 40, 0);
      g.addColorStop(0, '#8a979f'); g.addColorStop(0.45, '#eef3f6'); g.addColorStop(1, '#7d8a92');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(sh.x - 14, sh.y - 24);
      ctx.lineTo(sh.x + 14, sh.y - 24);
      ctx.lineTo(sh.x + 40, sh.y + 6);
      ctx.lineTo(sh.x - 40, sh.y + 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#6f7c84';
      ctx.beginPath(); ctx.ellipse(sh.x, sh.y + 7, 40, 7, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#c9e8ff';
      for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.arc(sh.x + i * 10, sh.y + 8, 1.6, 0, 6.283); ctx.fill(); }
    }

    drawTub() {
      const ctx = this.ctx, tx = this.tx, tw = this.tw, th = this.th, t = this.t;
      const rim = this.rimY(), by = rim + th;
      // feet
      ctx.fillStyle = '#d4a017';
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.ellipse(tx + s * tw * 0.33, by + 4, tw * 0.04, tw * 0.03, 0, 0, 6.283); ctx.fill();
      }
      const foamAt = (row) => {
        for (const f of this.foam) {
          if (f.row !== row) continue;
          const r = f.r * (1 + Math.sin(t * 2 + f.ph) * 0.06);
          const gx = ctx.createRadialGradient(tx + f.x - r * 0.3, rim + f.y - r * 0.4, r * 0.1, tx + f.x, rim + f.y, r);
          gx.addColorStop(0, '#ffffff'); gx.addColorStop(1, '#dbeaf5');
          ctx.fillStyle = gx;
          ctx.beginPath(); ctx.arc(tx + f.x, rim + f.y - 8, r, 0, 6.283); ctx.fill();
        }
      };
      foamAt(0);
      if (this.cfg.duck) this.drawDuck(tx - tw * 0.22, rim - tw * 0.06 + Math.sin(t * 2.6) * 4, tw * 0.085, Math.sin(t * 2.1) * 0.12);
      foamAt(1);
      // body
      const g = ctx.createLinearGradient(tx - tw / 2, 0, tx + tw / 2, 0);
      g.addColorStop(0, '#cfd8dc'); g.addColorStop(0.35, '#ffffff'); g.addColorStop(1, '#b8c6cc');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(tx - tw / 2, rim);
      ctx.lineTo(tx + tw / 2, rim);
      ctx.bezierCurveTo(tx + tw / 2, rim + th * 0.8, tx + tw * 0.45, by, tx + tw * 0.36, by);
      ctx.lineTo(tx - tw * 0.36, by);
      ctx.bezierCurveTo(tx - tw * 0.45, by, tx - tw / 2, rim + th * 0.8, tx - tw / 2, rim);
      ctx.fill();
      // rim
      ctx.fillStyle = '#fbfdfe';
      roundRect(ctx, tx - tw / 2 - 10, rim - 8, tw + 20, 18, 9);
      ctx.fill();
      ctx.strokeStyle = '#9fb3bd';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    drawDuck(x, y, s, rot) {
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillStyle = '#ffd54f';
      ctx.strokeStyle = '#f2a900';
      ctx.lineWidth = 2;
      // tail
      ctx.beginPath(); ctx.moveTo(-s * 0.9, -s * 0.1); ctx.lineTo(-s * 1.25, -s * 0.55); ctx.lineTo(-s * 0.6, -s * 0.35); ctx.closePath(); ctx.fill(); ctx.stroke();
      // body
      ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.62, 0, 0, 6.283); ctx.fill(); ctx.stroke();
      // head
      ctx.beginPath(); ctx.arc(s * 0.5, -s * 0.72, s * 0.42, 0, 6.283); ctx.fill(); ctx.stroke();
      // wing
      ctx.fillStyle = '#ffca28';
      ctx.beginPath(); ctx.ellipse(-s * 0.1, -s * 0.05, s * 0.45, s * 0.28, -0.25, 0, 6.283); ctx.fill(); ctx.stroke();
      // beak
      ctx.fillStyle = '#ff8f00';
      ctx.beginPath(); ctx.ellipse(s * 0.95, -s * 0.62, s * 0.28, s * 0.12, 0.1, 0, 6.283); ctx.fill();
      // eye
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.arc(s * 0.62, -s * 0.84, s * 0.075, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(s * 0.64, -s * 0.87, s * 0.025, 0, 6.283); ctx.fill();
      ctx.restore();
    }

    drawTitle() {
      const ctx = this.ctx, c = this.cfg, t = this.t, D = c.duration;
      const text = String(c.title || '');
      if (!text) return;
      const fs = Math.min(this.W * 0.13, 120);
      ctx.font = `900 ${fs}px "Baloo 2", "Comic Sans MS", "Chalkboard SE", "Trebuchet MS", system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      const chars = [...text];
      const widths = chars.map((ch) => ctx.measureText(ch).width);
      const total = widths.reduce((a, b) => a + b, 0);
      let x = this.W / 2 - total / 2;
      const cy = Math.min(this.H * 0.4, this.rimY() - fs * 0.9);
      const out = clamp01((t - (D - 1.2)) / 0.6);
      const grad = ctx.createLinearGradient(0, -fs * 0.45, 0, fs * 0.45); // letter-local coords
      grad.addColorStop(0, '#6fd3ff'); grad.addColorStop(0.55, '#2196f3'); grad.addColorStop(1, '#7b5cff');
      chars.forEach((ch, i) => {
        const w = widths[i];
        const ti = 0.9 + i * 0.07;
        const s = Math.max(0, easeOutBack(clamp01((t - ti) / 0.45))) * (1 - easeIn(out));
        if (s > 0.01 && ch.trim()) {
          const bob = Math.sin(t * 3.2 + i * 0.7) * fs * 0.06;
          ctx.save();
          ctx.translate(x + w / 2, cy + bob);
          ctx.rotate(Math.sin(t * 2.4 + i) * 0.06);
          ctx.scale(s, s);
          ctx.shadowColor = 'rgba(0,50,120,0.35)';
          ctx.shadowBlur = 14;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = fs * 0.14;
          ctx.strokeText(ch, 0, 0);
          ctx.shadowBlur = 0;
          ctx.fillStyle = grad;
          ctx.fillText(ch, 0, 0);
          ctx.restore();
        }
        x += w;
      });
      if (c.subtitle) {
        const a = clamp01((t - 1.8) / 0.5) * (1 - out);
        ctx.globalAlpha = a;
        ctx.font = `700 ${fs * 0.3}px "Baloo 2", "Comic Sans MS", "Trebuchet MS", system-ui, sans-serif`;
        ctx.lineWidth = fs * 0.06;
        ctx.strokeStyle = 'rgba(0,60,130,0.6)';
        ctx.strokeText(c.subtitle, this.W / 2, cy + fs * 0.78);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(c.subtitle, this.W / 2, cy + fs * 0.78);
        ctx.globalAlpha = 1;
      }
    }
  }

  let active = null; // one celebration at a time, even with several cards on screen

  class BathCard extends HTMLElement {
    setConfig(config) {
      this._config = Object.assign({}, DEFAULTS, config || {});
      this._render();
    }

    set hass(h) {
      this._hass = h;
      const e = this._config && this._config.entity;
      if (!e || !h.states[e]) return;
      const st = h.states[e];
      const key = st.state + '|' + st.last_changed;
      if (this._seen === undefined) { this._seen = key; this._prev = st.state; return; }
      if (key === this._seen) return;
      const prev = this._prev;
      this._seen = key;
      this._prev = st.state;
      if (st.state === 'unavailable' || st.state === 'unknown') return;
      const dom = e.split('.')[0];
      if (['input_boolean', 'switch', 'light', 'binary_sensor'].includes(dom)) {
        if (st.state === 'on' && prev !== 'on') this.play();
      } else {
        this.play(); // input_button / button / event: any new press
      }
    }

    _render() {
      if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
      const c = this._config;
      if (!c.show_button) {
        this.style.display = 'none';
        this.shadowRoot.innerHTML = '';
        return;
      }
      this.style.display = 'block';
      const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
      this.shadowRoot.innerHTML = `
        <style>
          :host { display: block; }
          button { all: unset; box-sizing: border-box; width: 100%; min-height: 110px; display: flex; flex-direction: column;
            align-items: center; justify-content: center; gap: 6px; padding: 16px; cursor: pointer;
            border-radius: var(--ha-card-border-radius, 12px);
            background: var(--ha-card-background, var(--card-background-color, #1c1f24));
            border: 1px solid var(--divider-color, #2a2e35); color: var(--primary-text-color, #e1e1e1);
            font-family: inherit; transition: transform .12s ease; -webkit-tap-highlight-color: transparent; }
          button:active { transform: scale(.95); }
          .icon { font-size: 44px; line-height: 1; }
          .name { font-size: 15px; font-weight: 500; }
        </style>
        <button type="button"><span class="icon">${esc(c.icon)}</span><span class="name">${esc(c.name)}</span></button>`;
      this.shadowRoot.querySelector('button').addEventListener('click', () => this._tap());
    }

    _tap() {
      const e = this._config.entity;
      if (e && this._hass) {
        const dom = e.split('.')[0];
        if (dom === 'input_button' || dom === 'button') this._hass.callService(dom, 'press', { entity_id: e });
        else this._hass.callService('homeassistant', 'turn_on', { entity_id: e });
      }
      this.play();
    }

    play() {
      if (active) return;
      active = new BathShow(this._config, () => { active = null; });
      active.start();
    }

    getCardSize() { return this._config && this._config.show_button ? 2 : 0; }
    getGridOptions() { return { columns: 3, rows: 2 }; }
    static getStubConfig() { return {}; }
  }

  if (!customElements.get('bath-card')) customElements.define('bath-card', BathCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'bath-card',
    name: 'Bath Time Celebration',
    description: 'A button that plays a 10 second bubbles-and-shower celebration over the dashboard.',
  });
})();
