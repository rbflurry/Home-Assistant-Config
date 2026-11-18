/*
 * leaves-card.js — Autumn leaves overlay for Home Assistant
 * Leaves fall, pile up along the bottom of the screen, and a little guy with a
 * backpack blower periodically walks across and blows them all away. A dog jumps in
 * the biggest pile now and then, and a school bus drives by kicking up the leaves.
 *
 * Install: copy to /config/www/leaves-card.js, add resource /local/leaves-card.js (JavaScript module),
 * then add a card:   type: custom:leaves-card
 */
(() => {
  const DEFAULTS = {
    spawn_rate: 1.5,       // new leaves per second
    max_falling: 40,       // cap on leaves in the air at once
    size: 22,              // base leaf size in px
    fall_speed: 1,         // multiplier
    wind: 15,              // sideways drift, px/s (negative = blow left)
    pile_threshold: 150,   // resting leaves that summon the blower
    blower_interval: 0,    // minutes between scheduled passes (0 = only when pile is full)
    blower_speed: 70,      // walk speed, px/s
    sprite_scale: 3,       // size of the blower guy (px per "pixel")
    z_index: 3,
    opacity: 1,
    entity: null,          // optional: when this entity turns "on", the blower comes out
    dog: true,             // a dog visits now and then and jumps in the biggest pile
    dog_interval: 2,       // minutes between dog visits
    dog_min_leaves: 50,    // only comes out once there's a decent pile
    dog_speed: 200,        // run speed, px/s
    dog_size: 4,           // size of the dog (px per "pixel")
    dog_breed: 'golden',   // 'golden', 'border_collie', or 'random' (picks one each visit)
    dog_entity: null,      // optional: when this entity turns "on" (or an input_button is pressed), the dog comes out
    bus: true,             // a school bus drives by now and then, kicking up leaves
    bus_interval: 5,       // minutes between drive-bys (0 = only at bus_times / bus_entity)
    bus_times: [],         // optional local times for a drive-by, e.g. ["07:45", "15:20"]
    bus_stop: true,        // stops mid-screen with flashing lights and the stop arm out
    bus_speed: 220,        // px/s
    bus_size: 4,           // size of the bus (px per "pixel")
    bus_entity: null,      // optional: when this entity turns "on" (or an input_button is pressed), the bus comes by
    colors: ['#c0392b', '#d35400', '#e67e22', '#f1c40f', '#a0522d', '#8e3b1f', '#e8a33d', '#b5651d'],
  };

  const rand = (a, b) => a + Math.random() * (b - a);

  function shade(hex, amt) {
    const n = parseInt(hex.replace('#', ''), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + amt))));
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }

  function makeLeafSprite(color, shape) {
    const S = 64, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.translate(S / 2, S / 2);
    g.fillStyle = color;
    g.strokeStyle = shade(color, -0.4);
    g.lineWidth = 2;
    g.lineJoin = 'round';
    g.beginPath();
    if (shape === 0) { // maple-ish
      for (let i = 0; i < 20; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 20;
        const r = i % 4 === 0 ? 27 : i % 2 === 0 ? 17 : 11;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
    } else if (shape === 1) { // pointed oval
      g.moveTo(0, -28);
      g.bezierCurveTo(19, -17, 17, 14, 0, 24);
      g.bezierCurveTo(-17, 14, -19, -17, 0, -28);
    } else { // round (birch/aspen)
      g.ellipse(0, -2, 17, 21, 0, 0, Math.PI * 2);
    }
    g.closePath();
    g.fill();
    g.stroke();
    // veins + stem
    g.globalAlpha = 0.55;
    g.lineWidth = 1.5;
    g.beginPath();
    if (shape === 0) {
      for (let i = 0; i < 20; i += 4) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 20;
        g.moveTo(0, 4);
        g.lineTo(Math.cos(a) * 20, Math.sin(a) * 20);
      }
    } else {
      g.moveTo(0, -22);
      g.lineTo(0, 22);
    }
    g.stroke();
    g.globalAlpha = 1;
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(0, shape === 0 ? 14 : 20);
    g.lineTo(1, 31);
    g.stroke();
    return c;
  }

  class LeafSim {
    constructor(cfg) {
      this.cfg = cfg;
      this.falling = [];
      this.resting = [];
      this.blown = [];
      this.guy = null;
      this.spawnAcc = 0;
      this.t = 0;
      this.colW = 6;
      this.lastBlow = performance.now();
      this.lastDog = performance.now();
      this.dog = null;
      this.lastBus = performance.now();
      this.bus = null;
      this.buildSprites();
      this.loop = this.loop.bind(this);
      this.onResize = this.resize.bind(this);
    }

    configure(cfg) {
      const recolor = cfg.colors !== this.cfg.colors;
      this.cfg = cfg;
      if (recolor) this.buildSprites();
      if (this.canvas) {
        this.canvas.style.zIndex = cfg.z_index;
        this.canvas.style.opacity = cfg.opacity;
      }
    }

    buildSprites() {
      this.sprites = [];
      for (const col of this.cfg.colors) for (let s = 0; s < 3; s++) this.sprites.push(makeLeafSprite(col, s));
    }

    start() {
      if (this.running) return;
      const c = document.createElement('canvas');
      Object.assign(c.style, {
        position: 'fixed', left: '0', top: '0', width: '100vw', height: '100vh',
        pointerEvents: 'none', zIndex: this.cfg.z_index, opacity: this.cfg.opacity,
      });
      document.body.appendChild(c);
      this.canvas = c;
      this.ctx = c.getContext('2d');
      window.addEventListener('resize', this.onResize);
      this.resize();
      this.running = true;
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.loop);
    }

    stop() {
      this.running = false;
      cancelAnimationFrame(this.raf);
      window.removeEventListener('resize', this.onResize);
      this.canvas?.remove();
      this.canvas = null;
    }

    resize() {
      this.dpr = window.devicePixelRatio || 1;
      this.W = window.innerWidth;
      this.H = window.innerHeight;
      this.canvas.width = Math.round(this.W * this.dpr);
      this.canvas.height = Math.round(this.H * this.dpr);
      const n = Math.ceil(this.W / this.colW) + 1;
      if (!this.pile || this.pile.length !== n) {
        this.pile = new Float32Array(n);
        this.resting = [];
      }
    }

    colAt(x) {
      return Math.max(0, Math.min(this.pile.length - 1, Math.floor(x / this.colW)));
    }

    newLeaf(x, y) {
      const c = this.cfg;
      return {
        x, y,
        size: c.size * rand(0.7, 1.3),
        vx: 0,
        vy: rand(35, 80),
        swayAmp: rand(20, 60),
        swayFreq: rand(1, 2.5),
        phase: rand(0, 6.28),
        rot: rand(0, 6.28),
        vrot: rand(-1.5, 1.5),
        flip: rand(0, 6.28),
        flipSpeed: rand(1, 4),
        sprite: this.sprites[(Math.random() * this.sprites.length) | 0],
      };
    }

    // leaves come mostly from a few off-screen "trees", so real piles build up
    spawnX() {
      if (!this.hot || this.hotW !== this.W) {
        this.hotW = this.W;
        this.hot = [0, 1, 2].map(() => rand(0.15, 0.85) * this.W);
      }
      if (Math.random() < 0.6) {
        const h = this.hot[(Math.random() * this.hot.length) | 0];
        return h + (Math.random() + Math.random() + Math.random() - 1.5) * this.W * 0.1;
      }
      return rand(-100, this.W + 100);
    }

    spawn() {
      this.falling.push(this.newLeaf(this.spawnX() - this.cfg.wind * 4, -30));
    }

    land(L) {
      const p = this.pile, s = L.size;
      if (this.resting.length > Math.max(this.cfg.pile_threshold * 2, 400)) return;
      let col = this.colAt(L.x);
      for (let k = 0; k < 12; k++) { // slide off steep spots so piles stay natural
        const l = col > 0 ? p[col - 1] : Infinity;
        const r = col < p.length - 1 ? p[col + 1] : Infinity;
        const m = Math.min(l, r);
        if (m < p[col] - s * 0.3) col = l < r ? col - 1 : col + 1;
        else break;
      }
      const h = p[col] + s * 0.15;
      for (let o = -2; o <= 2; o++) {
        const i = col + o;
        if (i >= 0 && i < p.length) p[i] += s * 0.42 * (1 - Math.abs(o) / 3);
      }
      this.resting.push({
        x: col * this.colW + rand(0, this.colW), h, size: s, sprite: L.sprite,
        rot: rand(0, 6.28), sy: rand(0.45, 0.8),
      });
    }

    addPile(n) {
      for (let i = 0; i < n; i++) this.land(this.newLeaf(Math.max(0, Math.min(this.W, this.spawnX())), 0));
    }

    clear() {
      this.falling = []; this.resting = []; this.blown = []; this.guy = null; this.dog = null; this.bus = null;
      this.pile.fill(0);
    }

    // --- the dog -----------------------------------------------------------
    fling(src, x, y, vx, vy) {
      this.blown.push({
        x, y, vx, vy, size: src.size, sprite: src.sprite, rot: src.rot || 0,
        vrot: rand(-14, 14), flip: 0, flipSpeed: rand(4, 12),
      });
    }

    clearZone(lo, hi, vel) { // pick up every resting leaf in [lo, hi] and send it flying
      for (let i = this.resting.length - 1; i >= 0; i--) {
        const R = this.resting[i];
        if (R.x >= lo && R.x <= hi) {
          this.resting.splice(i, 1);
          const v = vel(R);
          this.fling(R, R.x, this.H - R.h, v[0], v[1]);
        }
      }
      for (let k = this.colAt(lo); k <= this.colAt(hi); k++) this.pile[k] = 0;
    }

    pickBreed() {
      const b = String(this.cfg.dog_breed || 'golden').toLowerCase().replace(/[\s-]/g, '_');
      if (b === 'random') return Math.random() < 0.5 ? 'golden' : 'border_collie';
      return b.includes('collie') ? 'border_collie' : 'golden';
    }

    summonDog() {
      if (this.dog || this.guy || this.bus || !this.running) return false;
      const p = this.pile, u = this.cfg.dog_size, W = this.W, win = 8;
      const lo = this.colAt(W * 0.15), hi = this.colAt(W * 0.85);
      let best = -1, bi = (p.length / 2) | 0;
      for (let i = lo; i <= hi; i++) {
        let s = 0;
        for (let k = -win; k <= win; k++) s += p[i + k] || 0;
        if (s > best) { best = s; bi = i; }
      }
      const peak = bi * this.colW + this.colW / 2;
      const dir = peak > W / 2 ? 1 : -1; // come in from the side with more room
      this.dog = {
        state: 'run', t: 0, step: 0, dir, y: 0, ang: 0,
        x: dir > 0 ? -20 * u : W + 20 * u,
        peak, crouchX: peak - dir * 28 * u, mound: [],
        breed: this.pickBreed(),
      };
      return true;
    }

    updateDog(dt, now) {
      const D = this.dog, c = this.cfg, u = c.dog_size, W = this.W, H = this.H, sp = c.dog_speed;
      D.t += dt;
      const go = (s) => { D.state = s; D.t = 0; };
      const kick = () => {
        const a = D.x - 4 * u * D.dir, b = D.x + 9 * u * D.dir;
        this.clearZone(Math.min(a, b), Math.max(a, b), () => [D.dir * rand(60, 280), -rand(120, 330)]);
      };
      switch (D.state) {
        case 'run':
          D.x += D.dir * sp * dt;
          D.step += (dt * sp) / (2.2 * u);
          if ((D.x - D.crouchX) * D.dir >= 0) { D.x = D.crouchX; go('crouch'); }
          break;
        case 'crouch': // play bow + butt wiggle
          if (D.t > 0.9) { D.x0 = D.x; go('leap'); }
          break;
        case 'leap': {
          const p = Math.min(1, D.t / 0.65), dist = Math.abs(D.peak - D.x0) || 1;
          const hgt = 24 * u + this.pile[this.colAt(D.peak)] * 0.6;
          D.x = D.x0 + (D.peak - D.x0) * p;
          D.y = -Math.sin(Math.PI * p) * hgt;
          D.ang = Math.atan((-Math.PI * Math.cos(Math.PI * p) * hgt) / dist) * 0.8;
          if (p >= 1) {
            D.y = 0; D.ang = 0;
            const R = 22 * u;
            this.clearZone(D.peak - R, D.peak + R, (L) => [rand(-260, 260) + (L.x - D.peak) * 3, -rand(250, 560)]);
            for (let i = 0; i < 16; i++) {
              D.mound.push({
                dx: rand(-11, 11) * u, dy: rand(1, 8) * u, ph: rand(0, 6.28),
                size: c.size * rand(0.8, 1.25), rot: rand(0, 6.28),
                sprite: this.sprites[(Math.random() * this.sprites.length) | 0],
              });
            }
            go('buried');
          }
          break;
        }
        case 'buried': // wiggling under the leaves
          if (D.mound.length && Math.random() < dt * 3) {
            const m = D.mound.splice((Math.random() * D.mound.length) | 0, 1)[0];
            this.fling(m, D.x + m.dx, H - m.dy, rand(-120, 120), -rand(200, 380));
          }
          if (D.t > 1.6) {
            for (const m of D.mound) this.fling(m, D.x + m.dx, H - m.dy, rand(-200, 200), -rand(250, 450));
            D.mound = [];
            go('pop');
          }
          break;
        case 'pop':
          D.y = -Math.sin(Math.PI * Math.min(1, D.t / 0.35)) * 9 * u;
          if (D.t > 0.35) { D.y = 0; go('shake'); }
          break;
        case 'shake': // shake off the leaves stuck in his fur
          if (D.t > 0.15 && D.t < 0.8 && Math.random() < dt * 9) {
            const s = this.sprites[(Math.random() * this.sprites.length) | 0];
            this.fling({ size: c.size * 0.8, sprite: s }, D.x + rand(-5, 5) * u, H - rand(6, 11) * u,
              (Math.random() < 0.5 ? -1 : 1) * rand(120, 260), -rand(100, 260));
          }
          if (D.t > 0.9) { D.target = D.dir > 0 ? W * 0.85 : W * 0.15; go('zoom'); }
          break;
        case 'zoom': // zoomies one way...
          D.x += D.dir * sp * 1.7 * dt;
          D.step += (dt * sp * 1.7) / (2.2 * u);
          kick();
          if ((D.x - D.target) * D.dir >= 0) { D.dir = -D.dir; go('exit'); }
          break;
        case 'exit': // ...then all the way back across and off screen
          D.x += D.dir * sp * 1.7 * dt;
          D.step += (dt * sp * 1.7) / (2.2 * u);
          kick();
          if (D.x < -25 * u || D.x > W + 25 * u) { this.dog = null; this.lastDog = now; }
          break;
      }
    }

    drawDog(D) {
      const ctx = this.ctx, u = this.cfg.dog_size, d = this.dpr;
      const collie = D.breed === 'border_collie';
      // palettes: golden retriever = warm gold with feathering; border collie = black & white
      const P = collie
        ? { body: '#232327', shade: '#111113', white: '#f4f4f2', paw: '#f4f4f2', collar: '#1e88e5' }
        : { body: '#d9a144', shade: '#b47c2c', white: '#f3cf86', paw: '#c58a36', collar: '#d32f2f' };
      let y = D.y, ang = D.ang, jit = 0;
      if (D.state === 'crouch') ang = 0.16;
      if (D.state === 'buried') y += 5 * u;
      if (D.state === 'shake') jit = Math.sin(this.t * 70) * 0.9 * u;
      ctx.setTransform(d * D.dir, 0, 0, d, d * (D.x + jit), d * (this.H + y));
      ctx.rotate(ang);
      if (collie) { // soft light edge so a black dog still reads on dark dashboards
        ctx.shadowColor = 'rgba(225,230,240,0.55)';
        ctx.shadowBlur = 3 * d;
      }
      const R = (x, yy, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x * u, yy * u, w * u, h * u); };
      const running = D.state === 'run' || D.state === 'zoom' || D.state === 'exit';
      let fa = 0, ba = 0;
      if (running) { fa = Math.sin(D.step) * 0.7; ba = Math.sin(D.step + Math.PI) * 0.7; }
      if (D.state === 'leap') { fa = -1.1; ba = 1.0; }
      if (D.state === 'crouch') { fa = -1.0; ba = 0.15; }
      const leg = (hx, a, col, front) => {
        ctx.save();
        ctx.translate(hx * u, -5.5 * u);
        ctx.rotate(a);
        R(-0.8, 0, 1.6, 4.6, col);
        if (!collie) R(front ? 0.6 : -1.5, 0.6, 0.9, 2.6, P.white);       // leg feathering
        if (collie) R(-0.8, 2.6, 1.6, 2, P.white);                        // white socks
        R(-0.8, 4.3, 2.3, 1.1, P.paw);
        ctx.restore();
      };
      leg(-4.2, ba * 0.8, P.shade, false); leg(4.6, fa * 0.8, P.shade, true);   // far legs

      // tail: golden = long feathered plume, collie = low sweep with a white tip
      const wagSpeed = D.state === 'crouch' || D.state === 'shake' || D.state === 'pop' ? 28 : 12;
      const wag = Math.sin(this.t * wagSpeed) * 1.6;
      const tip = { x: -10 * u, y: (collie ? -10.5 + wag * 0.7 : -13 + wag) * u };
      ctx.lineCap = 'round';
      ctx.strokeStyle = collie ? P.body : P.shade;
      ctx.lineWidth = (collie ? 1.4 : 1.9) * u;
      ctx.beginPath();
      ctx.moveTo(-6 * u, -9 * u);
      ctx.quadraticCurveTo(-8.5 * u, (collie ? -8 : -10) * u, tip.x, tip.y);
      ctx.stroke();
      if (!collie) { // feathered underside
        ctx.strokeStyle = P.white;
        ctx.lineWidth = 0.8 * u;
        ctx.beginPath();
        ctx.moveTo(-6.5 * u, -8.2 * u);
        ctx.quadraticCurveTo(-9 * u, -9 * u, tip.x - 0.6 * u, tip.y + 0.9 * u);
        ctx.stroke();
      } else {
        R(tip.x / u - 1, tip.y / u - 0.8, 1.8, 1.6, P.white);
      }

      // body
      R(-6.5, -10.2, 12.5, 5.2, P.body);
      if (collie) {
        R(-6.5, -10.2, 12.5, 1.2, P.shade);
        R(-4, -5.8, 6, 0.8, P.white);                 // white belly
        R(2.6, -10.6, 3.6, 5.6, P.white);             // white chest ruff
        R(1.9, -9.8, 1, 3.6, P.white);
      } else {
        R(-6.5, -10.2, 12.5, 1, '#e8b558');           // sun-lit back
        R(-4.5, -5.5, 8, 1.2, P.white);               // feathered belly fringe
        R(-4, -4.6, 1, 0.8, P.white); R(-1.5, -4.6, 1, 0.9, P.white); R(1, -4.6, 1, 0.8, P.white);
        R(3, -10.2, 3.2, 5, P.white);                 // chest
      }
      leg(-5, ba, P.body, false); leg(3.8, fa, P.body, true);                // near legs

      // head
      const earFlop = D.state === 'shake' ? Math.sin(this.t * 70) * 1.2 : running ? Math.sin(D.step) * 0.5 : 0;
      R(5, -14.6, 5.5, 5.2, P.body);
      if (collie) {
        R(7.4, -14.6, 1.1, 2.2, P.white);             // white blaze
        R(9.3, -12.6, 3.3, 2.9, P.white);             // white muzzle
        R(8.4, -12.2, 1.2, 1.6, P.white);
        R(7.5, -13.6, 1.3, 1.2, '#e8e8e8');           // eye rim so it reads on black
        R(7.8, -13.4, 0.8, 0.8, '#5a3a1a');
        // semi-pricked ears with folded tips
        R(5.4, -16.6 + earFlop * 0.2, 1.8, 2.4, P.body);
        R(6.6, -16.9 + earFlop * 0.2, 1.1, 0.9, P.body);
      } else {
        R(9.5, -12.4, 3, 2.7, '#e6b765');             // muzzle
        R(7.8, -13.4, 0.9, 0.9, '#222');
        R(5.2, -14 + earFlop * 0.3, 2.4, 4.8, P.shade); // long floppy ear
        R(5.4, -9.6 + earFlop * 0.3, 1.6, 0.7, P.shade);
      }
      R(12, -12.6, 1.1, 1.1, '#222');                 // nose
      if (running || D.state === 'pop') R(10.4, -9.9, 1, 1.7, '#ff7aa2');
      R(4.4, -10.8, 1.2, 4.2, P.collar);
      R(5, -7, 0.9, 0.9, '#ffd54f');
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
    }

    // ===== school bus drive-by ==================================================
    startBus() {
      if (this.bus || this.guy || this.dog || !this.running) return false;
      const W = this.W, u = this.cfg.bus_size, dir = Math.random() < 0.5 ? 1 : -1;
      const hair = ['#3e2723', '#6d4c41', '#f2c14e', '#1b1b1b', '#a0522d', '#d4a017'];
      const skin = ['#f0c39b', '#d9a066', '#8d5524', '#f6d1b1', '#c68642'];
      const kids = [];
      for (let i = 0; i < 7; i++) {
        kids.push(Math.random() < 0.7 ? {
          hair: hair[(Math.random() * hair.length) | 0], skin: skin[(Math.random() * skin.length) | 0],
          wave: Math.random() < 0.35, ph: rand(0, 6.28),
        } : null);
      }
      this.bus = {
        x: dir > 0 ? -30 * u : W + 30 * u, dir, v: this.cfg.bus_speed, phase: 'drive', t: 0,
        arm: 0, wheel: 0, kids, stops: !!this.cfg.bus_stop, stopX: rand(0.4, 0.6) * W,
      };
      return true;
    }

    busDue(now) { // scheduled times like "07:45" (local), plus an optional interval
      const c = this.cfg;
      if (c.bus_interval > 0 && now - this.lastBus > c.bus_interval * 60000) return true;
      const times = Array.isArray(c.bus_times) ? c.bus_times : c.bus_times ? String(c.bus_times).split(',') : [];
      if (!times.length) return false;
      const d = new Date(), hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      const key = d.toDateString() + ' ' + hm;
      if (times.map((s) => String(s).trim().padStart(5, '0')).includes(hm) && this.busKey !== key) { this.busKey = key; return true; }
      return false;
    }

    updateBus(dt, now) {
      const B = this.bus, c = this.cfg, u = c.bus_size, W = this.W, H = this.H;
      B.t += dt;
      const decel = 260, accel = 160, v0 = c.bus_speed;
      if (B.phase === 'drive' || B.phase === 'slow') {
        const dist = (B.stopX - B.x) * B.dir;
        if (B.stops && dist > 0 && dist < (v0 * v0) / (2 * decel)) {
          B.phase = 'slow';
          B.v = Math.max(18, Math.sqrt(2 * decel * dist));
          if (dist < 1.5) { B.v = 0; B.x = B.stopX; B.phase = 'stopped'; B.t = 0; }
        }
      } else if (B.phase === 'stopped') {
        B.arm = B.t < 3.2 ? Math.min(1, B.t / 0.4) : Math.max(0, 1 - (B.t - 3.2) / 0.4);
        if (B.t > 3.7) { B.phase = 'go'; B.t = 0; B.stops = false; }
      } else if (B.phase === 'go') {
        B.v = Math.min(v0, B.v + accel * dt);
      }
      B.x += B.dir * B.v * dt;
      B.wheel += (B.dir * B.v * dt) / (2.8 * u);
      // leaves swirl up in the wake behind the bus (and get pushed by the front bumper)
      if (B.v > 30) {
        const rear = B.x - B.dir * 24 * u, front = B.x + B.dir * 26 * u;
        const k = Math.min(1, B.v / v0);
        this.clearZone(Math.min(rear, rear - B.dir * 14 * u), Math.max(rear, rear - B.dir * 14 * u),
          () => [B.dir * rand(60, 280) * k, -rand(150, 420) * k]);
        this.clearZone(Math.min(front, front + B.dir * 6 * u), Math.max(front, front + B.dir * 6 * u),
          () => [B.dir * rand(200, 380) * k, -rand(60, 200) * k]);
        for (const L of this.falling) { // gust lifts nearby falling leaves too
          if (Math.abs(L.x - B.x) < 30 * u && L.y > H - 40 * u) L.x += B.dir * B.v * 0.6 * dt;
        }
      }
      if ((B.dir > 0 && B.x > W + 32 * u) || (B.dir < 0 && B.x < -32 * u)) { this.bus = null; this.lastBus = now; }
    }

    drawBus(B) {
      const ctx = this.ctx, u = this.cfg.bus_size, d = this.dpr, t = this.t;
      ctx.setTransform(d * B.dir, 0, 0, d, d * B.x, d * this.H);
      const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x * u, y * u, w * u, h * u); };
      const yel = '#f9b800', yelDark = '#d99a00';
      // exhaust
      for (let i = 0; i < 3; i++) {
        const o = (t * 30 + i * 9) % 27;
        ctx.fillStyle = `rgba(150,150,150,${0.35 * (1 - o / 27)})`;
        ctx.beginPath(); ctx.arc(-25 * u - o * 0.8, -2.5 * u - o * 0.3, 2 + o * 0.25, 0, 6.283); ctx.fill();
      }
      // body + hood
      ctx.fillStyle = yel;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-24 * u, -18 * u, 44 * u, 14.5 * u, [2 * u, 2 * u, 0.5 * u, 0.5 * u]);
      else ctx.rect(-24 * u, -18 * u, 44 * u, 14.5 * u);
      ctx.fill();
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(19 * u, -10.5 * u, 7 * u, 7 * u, [0, 1.6 * u, 0.4 * u, 0]);
      else ctx.rect(19 * u, -10.5 * u, 7 * u, 7 * u);
      ctx.fill();
      R(-24, -18, 44, 1.1, yelDark);
      R(-24, -8.4, 50, 0.8, '#222');
      R(-24, -6.3, 50, 0.8, '#222');
      R(19.2, -10.5, 0.6, 7, yelDark);
      // windows with kids
      for (let i = 0; i < 7; i++) {
        const wx = -21.5 + i * 5;
        R(wx, -16, 4.2, 4.6, '#cfe8f5');
        const k = B.kids[i];
        if (k) {
          ctx.save();
          ctx.beginPath(); ctx.rect(wx * u, -16 * u, 4.2 * u, 4.6 * u); ctx.clip();
          R(wx + 1.1, -12.6, 2, 1.4, '#5c6bc0');               // shoulders
          R(wx + 1.3, -14.4, 1.6, 1.9, k.skin);                // head
          R(wx + 1.2, -14.8, 1.8, 0.7, k.hair);                // hair
          if (k.wave) {
            const wy = -15.2 + Math.sin(t * 9 + k.ph) * 0.6;
            R(wx + 3.1, wy, 0.8, 1, k.skin);                   // waving hand
          }
          ctx.restore();
        }
        R(wx, -11.6, 4.2, 0.5, yelDark);
      }
      // door + windshield + driver
      R(14.6, -16, 3.4, 12, yelDark);
      R(15, -15.5, 1.2, 5, '#cfe8f5'); R(16.4, -15.5, 1.2, 5, '#cfe8f5');
      R(18.4, -16, 1.4, 5.4, '#cfe8f5');
      R(18.6, -14.2, 1, 1.3, '#f0c39b'); R(18.5, -14.6, 1.2, 0.5, '#3e2723');
      // lettering
      ctx.fillStyle = '#1b1b1b';
      ctx.font = `bold ${1.7 * u}px system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.save(); if (B.dir < 0) { ctx.scale(-1, 1); ctx.textAlign = 'center'; ctx.fillText('SCHOOL BUS', 2 * u, -9.9 * u); }
      else { ctx.textAlign = 'center'; ctx.fillText('SCHOOL BUS', -2 * u, -9.9 * u); }
      ctx.restore();
      // lights: amber while slowing, red while stopped
      const blink = Math.sin(t * 12) > 0;
      const amber = B.phase === 'slow' && blink, red = B.phase === 'stopped' && blink;
      R(17.6, -19, 1.6, 1, amber ? '#ffb300' : '#7a5a10');
      R(15.6, -19, 1.6, 1, red ? '#ff1744' : '#6a1010');
      R(-23.6, -19, 1.6, 1, red ? '#ff1744' : '#6a1010');
      R(-21.6, -19, 1.6, 1, amber ? '#ffb300' : '#7a5a10');
      R(25.5, -9, 0.7, 1.3, '#fff59d');                     // headlight
      R(-24.4, -7, 0.6, 1.4, red || B.phase === 'slow' ? '#ff5252' : '#8b1c1c');
      R(25.6, -4.2, 1, 1.4, '#3a3a3a'); R(-24.8, -4.2, 1, 1.4, '#3a3a3a'); // bumpers
      // stop arm
      if (B.arm > 0) {
        const ax = 11.5 * u, ay = -12 * u, r = 2.6 * u * B.arm;
        ctx.save();
        ctx.translate(ax, ay - 3 * u * B.arm);
        ctx.fillStyle = '#d50000';
        ctx.beginPath();
        for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i * Math.PI) / 4; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.35 * u; ctx.stroke();
        if (B.arm > 0.8) {
          ctx.fillStyle = '#fff'; ctx.font = `bold ${1.2 * u}px system-ui, sans-serif`; ctx.textAlign = 'center';
          if (B.dir < 0) ctx.scale(-1, 1);
          ctx.fillText('STOP', 0, 0.1 * u);
        }
        ctx.restore();
      }
      // wheels
      for (const wx of [-15, 13]) {
        ctx.fillStyle = '#1b1b1b';
        ctx.beginPath(); ctx.arc(wx * u, -2.8 * u, 2.8 * u, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#9e9e9e';
        ctx.beginPath(); ctx.arc(wx * u, -2.8 * u, 1.3 * u, 0, 6.283); ctx.fill();
        ctx.strokeStyle = '#616161'; ctx.lineWidth = 0.4 * u;
        for (let k = 0; k < 3; k++) {
          const a = B.wheel + (k * Math.PI * 2) / 3;
          ctx.beginPath(); ctx.moveTo(wx * u, -2.8 * u); ctx.lineTo(wx * u + Math.cos(a) * 1.3 * u, -2.8 * u + Math.sin(a) * 1.3 * u); ctx.stroke();
        }
      }
    }

    summon() {
      if (this.guy || this.dog || this.bus || !this.running) return;
      const u = this.cfg.sprite_scale, dir = Math.random() < 0.5 ? 1 : -1;
      this.guy = { x: dir > 0 ? -30 * u : this.W + 30 * u, dir, step: 0 };
    }

    loop(now) {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.update(dt, now);
      this.draw();
      this.raf = requestAnimationFrame(this.loop);
    }

    update(dt, now) {
      const c = this.cfg, W = this.W, H = this.H;
      this.t += dt;

      this.spawnAcc += c.spawn_rate * dt;
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        if (this.falling.length < c.max_falling) this.spawn();
      }

      if (c.bus && !this.bus && !this.guy && !this.dog && this.busDue(now)) this.startBus();
      if (this.bus) this.updateBus(dt, now);

      if (c.dog && !this.dog && !this.guy && !this.bus && this.resting.length >= c.dog_min_leaves &&
          now - this.lastDog > c.dog_interval * 60000) this.summonDog();
      if (this.dog) this.updateDog(dt, now);

      if (!this.guy && !this.dog && !this.bus) {
        if (this.resting.length >= c.pile_threshold) this.summon();
        else if (c.blower_interval > 0 && this.resting.length > 10 &&
                 now - this.lastBlow > c.blower_interval * 60000) this.summon();
      }

      // the blower guy
      const g = this.guy, u = c.sprite_scale;
      let nz = null;
      const reach = 60 * u;
      if (g) {
        g.x += g.dir * c.blower_speed * dt;
        g.step += (dt * c.blower_speed) / (4 * u);
        nz = { x: g.x + g.dir * 15 * u, y: H - 4.5 * u };
        if ((g.dir > 0 && g.x > W + 30 * u) || (g.dir < 0 && g.x < -30 * u)) {
          this.guy = null;
          this.lastBlow = now;
        }
      }
      const inStream = (x, y) => {
        if (!nz) return -1;
        const d = (x - nz.x) * g.dir;
        return d > -4 * u && d < reach && y > H - 22 * u ? d : -1;
      };
      const toBlown = (L, x, y) => {
        L.x = x; L.y = y;
        L.vx = g.dir * rand(150, 400);
        L.vy = -rand(80, 260);
        L.vrot = rand(-12, 12);
        L.flip = L.flip || 0;
        L.flipSpeed = rand(4, 12);
        this.blown.push(L);
      };

      // falling leaves
      for (let i = this.falling.length - 1; i >= 0; i--) {
        const L = this.falling[i];
        L.phase += L.swayFreq * dt;
        L.x += (c.wind + Math.sin(L.phase) * L.swayAmp) * dt;
        L.y += L.vy * c.fall_speed * dt;
        L.rot += L.vrot * dt;
        L.flip += L.flipSpeed * dt;
        if (L.x < -120) L.x += W + 240;
        if (L.x > W + 120) L.x -= W + 240;
        if (inStream(L.x, L.y) >= 0) {
          this.falling.splice(i, 1);
          toBlown(L, L.x, L.y);
          continue;
        }
        if (L.x >= 0 && L.x <= W && L.y + L.size * 0.25 >= H - this.pile[this.colAt(L.x)]) {
          this.falling.splice(i, 1);
          this.land(L);
        } else if (L.y > H + 40) {
          this.falling.splice(i, 1);
        }
      }

      // pick up resting leaves right at the nozzle
      if (nz) {
        const lo = g.dir > 0 ? nz.x - 4 * u : nz.x - 12 * u;
        const hi = g.dir > 0 ? nz.x + 12 * u : nz.x + 4 * u;
        let any = false;
        for (let i = this.resting.length - 1; i >= 0; i--) {
          const R = this.resting[i];
          if (R.x >= lo && R.x <= hi) {
            this.resting.splice(i, 1);
            toBlown({ size: R.size, sprite: R.sprite, rot: R.rot, flip: 0 }, R.x, H - R.h);
            any = true;
          }
        }
        const a = Math.max(0, this.colAt(lo)), b = this.colAt(hi);
        for (let k = a; k <= b; k++) this.pile[k] = 0;
        if (!any && this.resting.length === 0) { /* nothing left; keep walking */ }
      }

      // airborne / blown leaves
      for (let i = this.blown.length - 1; i >= 0; i--) {
        const L = this.blown[i];
        const d = inStream(L.x, L.y);
        if (d >= 0) {
          const f = 1 - d / reach;
          L.vx += g.dir * 900 * f * dt;
          L.vy -= 380 * f * dt;
        }
        L.vy += 420 * dt;
        L.vx *= Math.exp(-1.3 * dt);
        L.vy *= Math.exp(-0.6 * dt);
        L.x += L.vx * dt;
        L.y += L.vy * dt;
        L.rot += L.vrot * dt;
        L.flip += L.flipSpeed * dt;
        const surface = this.guy || L.x < 0 || L.x > W ? 0 : this.pile[this.colAt(L.x)];
        const floor = H - surface - L.size * 0.25;
        if (!this.guy && L.vy > 0 && L.y >= floor && L.x >= 0 && L.x <= W) {
          this.blown.splice(i, 1);
          this.land(L); // kicked/scattered leaves settle back onto the pile
          continue;
        }
        if (L.y > floor) {
          L.y = floor;
          if (L.vy > 0) { // bounce only when coming down
            L.vy *= -0.35;
            L.vx *= 0.8;
            L.vrot *= 0.7;
          }
        }
        if (L.x < -80 || L.x > W + 80) {
          this.blown.splice(i, 1);
        } else if (!this.guy && L.y >= floor - 1 && Math.abs(L.vx) < 8 && Math.abs(L.vy) < 30) {
          this.blown.splice(i, 1);
          this.land(L); // settled back down after the blower left
        }
      }
    }

    drawLeaf(L, x, y, sx, sy) {
      const d = this.dpr, cs = Math.cos(L.rot), sn = Math.sin(L.rot), s = L.size;
      this.ctx.setTransform(d * cs * sx, d * sn * sx, -d * sn * sy, d * cs * sy, d * x, d * y);
      this.ctx.drawImage(L.sprite, -s / 2, -s / 2, s, s);
    }

    draw() {
      const ctx = this.ctx, H = this.H;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      const D = this.dog, airborne = D && (D.state === 'leap' || D.state === 'pop');
      if (D && !airborne) this.drawDog(D); // drawn under the pile so he wades through it
      for (const R of this.resting) this.drawLeaf(R, R.x, H - R.h, 1, R.sy);
      if (D) {
        for (const m of D.mound) {
          const j = Math.sin(this.t * 22 + m.ph) * 0.12;
          this.drawLeaf({ ...m, rot: m.rot + j }, D.x + m.dx + j * 10, H - m.dy, 1, 0.7);
        }
        if (airborne) this.drawDog(D);
      }
      if (this.bus) this.drawBus(this.bus);
      const tumble = (L) => {
        const f = Math.cos(L.flip);
        return Math.sign(f || 1) * Math.max(0.15, Math.abs(f));
      };
      for (const L of this.falling) this.drawLeaf(L, L.x, L.y, tumble(L), 1);
      if (this.guy) this.drawGuy(this.guy);
      for (const L of this.blown) this.drawLeaf(L, L.x, L.y, tumble(L), 1);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    drawGuy(g) {
      const ctx = this.ctx, u = this.cfg.sprite_scale, d = this.dpr;
      const jitter = Math.sin(this.t * 90) * 0.25; // engine rumble
      const bob = Math.abs(Math.sin(g.step)) * -0.6 * u;
      ctx.setTransform(d * g.dir, 0, 0, d, d * g.x, d * this.H);
      const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x * u, y * u, w * u, h * u); };

      // air stream
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 7; i++) {
        const o = (this.t * 420 + i * 53) % 160;
        const y0 = -4.5 * u + (i - 3) * 1.6 + o * 0.04;
        ctx.strokeStyle = `rgba(255,255,255,${0.4 * (1 - o / 160)})`;
        ctx.beginPath();
        ctx.moveTo(16 * u + o, Math.min(-1, y0));
        ctx.lineTo(16 * u + o + 14, Math.min(-1, y0 + 1));
        ctx.stroke();
      }
      // exhaust puffs
      for (let i = 0; i < 3; i++) {
        const o = (this.t * 30 + i * 9) % 27;
        ctx.fillStyle = `rgba(160,160,160,${0.35 * (1 - o / 27)})`;
        ctx.beginPath();
        ctx.arc(-9 * u - o * 0.6, -25 * u - o, 2 + o * 0.25, 0, 6.28);
        ctx.fill();
      }

      const leg = (angle, jeans, boot) => {
        ctx.save();
        ctx.translate(0, -12 * u);
        ctx.rotate(angle);
        R(-1.5, 0, 3, 10, jeans);
        R(-1.5, 10, 4.5, 2, boot);
        ctx.restore();
      };
      const sw = Math.sin(g.step) * 0.45;
      leg(-sw, '#2c4a73', '#3b2414');
      ctx.translate(jitter, bob);
      // backpack blower
      R(-8.5, -17, 5, 2.5, '#4a4a4a');
      R(-8, -25.5, 4.5, 9, '#e8742a');
      R(-7.5, -24, 1.2, 5, '#b9561b');
      R(-7.3, -27, 2, 1.6, '#333');
      // torso (plaid jacket)
      R(-3.5, -24, 7, 12, '#b23a2a');
      R(-3.5, -21, 7, 0.6, '#6e1f16');
      R(-3.5, -17, 7, 0.6, '#6e1f16');
      R(-1, -24, 0.6, 12, '#6e1f16');
      R(2, -24, 0.6, 12, '#6e1f16');
      R(-3.5, -12.8, 7, 1, '#3b2a1a');
      R(-3.5, -24, 1, 9, '#222');
      ctx.translate(-jitter, -bob);
      leg(sw, '#365a8a', '#4a2c18');
      ctx.translate(jitter, bob);
      // hose + tube
      ctx.strokeStyle = '#2f2f2f';
      ctx.lineWidth = 1.8 * u;
      ctx.beginPath();
      ctx.moveTo(-5 * u, -15 * u);
      ctx.quadraticCurveTo(-1 * u, -7 * u, 5 * u, -11.5 * u);
      ctx.stroke();
      ctx.strokeStyle = '#8a8a8a';
      ctx.lineWidth = 1.5 * u;
      ctx.beginPath();
      ctx.moveTo(5 * u, -11.5 * u);
      ctx.lineTo(15 * u, -4.8 * u);
      ctx.stroke();
      ctx.strokeStyle = '#e8742a';
      ctx.lineWidth = 1.7 * u;
      ctx.beginPath();
      ctx.moveTo(4 * u, -12.2 * u);
      ctx.lineTo(6.5 * u, -10.5 * u);
      ctx.stroke();
      // arm + hand
      ctx.strokeStyle = '#a3342a';
      ctx.lineWidth = 2 * u;
      ctx.beginPath();
      ctx.moveTo(1 * u, -22 * u);
      ctx.lineTo(4.6 * u, -13.6 * u);
      ctx.stroke();
      R(4, -14, 1.7, 1.7, '#f0c39b');
      // head
      R(-0.5, -25, 2, 1.2, '#e0b088');
      R(-2, -30.5, 5, 5.6, '#f0c39b');
      R(1.9, -28.6, 0.8, 0.8, '#222');
      R(3, -27.6, 0.7, 1, '#e3a77f');
      R(-2, -25.6, 5, 0.9, '#8a5a3b');
      // hearing protection
      R(-1.6, -28.8, 2, 2.6, '#f2c200');
      // beanie
      R(-2.3, -32.2, 5.6, 2.2, '#2e7d32');
      R(-2.3, -30.6, 5.6, 0.9, '#1b5e20');
      R(-0.1, -33.4, 1.6, 1.3, '#f5f5f5');
    }
  }

  class LeavesCard extends HTMLElement {
    setConfig(config) {
      this._config = Object.assign({}, DEFAULTS, config || {});
      if (this._sim) this._sim.configure(this._config);
    }
    set hass(h) {
      if (!this._config) return;
      this._watch = this._watch || {};
      const check = (e, fn) => {
        if (!e || !h.states[e]) return;
        const st = h.states[e], key = st.state + '|' + st.last_changed, w = this._watch[e];
        this._watch[e] = { key, state: st.state };
        if (!w || w.key === key || st.state === 'unavailable' || st.state === 'unknown') return;
        const dom = e.split('.')[0];
        const pressLike = ['input_button', 'button', 'scene', 'event'].includes(dom);
        if (pressLike || (st.state === 'on' && w.state !== 'on')) fn();
      };
      check(this._config.entity, () => this.blow());
      check(this._config.dog_entity, () => this.dog());
      check(this._config.bus_entity, () => this.busBy());
    }
    connectedCallback() {
      this.style.display = 'block';
      this.style.height = '0';
      if (!this._config) this._config = Object.assign({}, DEFAULTS);
      if (!this._sim) this._sim = new LeafSim(this._config);
      this._sim.start();
    }
    disconnectedCallback() { this._sim && this._sim.stop(); }
    getCardSize() { return 0; }
    static getStubConfig() { return {}; }
    // handy for testing from the browser console
    blow() { this._sim && this._sim.summon(); }
    dog() { this._sim && this._sim.summonDog(); }
    busBy() { this._sim && this._sim.startBus(); }
    addPile(n = 80) { this._sim && this._sim.addPile(n); }
    clear() { this._sim && this._sim.clear(); }
    get restingCount() { return this._sim ? this._sim.resting.length : 0; }
  }

  if (!customElements.get('leaves-card')) customElements.define('leaves-card', LeavesCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'leaves-card',
    name: 'Autumn Leaves Overlay',
    description: 'Falling leaves, a leaf-blower guy, a dog who jumps in the piles, and a school bus drive-by.',
  });
})();
