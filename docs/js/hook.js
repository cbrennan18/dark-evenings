// Hook: Ireland's outline with the evening shadow at 18:00 on the clocks-change
// weekend. Sat 24 Oct 2026 18:00 IST (17:00 UTC) -> Sun 25 Oct 2026 18:00 GMT
// (18:00 UTC). Same clock time, an hour later by the sun.
// Colour per pixel from the sun's altitude, using the sky calendar's ramp.
// The slide sweeps the one hour of real time between the two states (not the
// 25 h between the two instants), then lands exactly on Sunday.
(function (root) {
  var SAT = Date.UTC(2026, 9, 24, 17, 0);
  var SUN = Date.UTC(2026, 9, 25, 18, 0);
  var SWEEP_MS = 3600000;
  var HOLD_MS = 2500;
  var SLIDE_MS = 6000;
  var LABELS = ['Sat 24 Oct · 18:00', 'Sun 25 Oct · 18:00'];
  var K = Math.cos(53.4 * Math.PI / 180); // longitude squeeze at Ireland's latitude
  var LATTICE = 6;        // css px between altitude samples; interpolated between
  var ALT_LO = -7, ALT_HI = 12, ALT_STEP = 0.005; // colour lookup range / resolution (deg)
  var LABEL_H = 56;       // css px reserved under the map for the labels
  var PAD = 12;

  // 0 = lit, 1 = twilight, 2 = night
  function shadeClass(alt) { return alt < -6 ? 2 : alt < -0.833 ? 1 : 0; }
  // Sun's real instant at slide progress e (0 = Saturday, 1 = Sunday).
  function instant(e) { return e >= 1 ? SUN : SAT + e * SWEEP_MS; }

  var api = { SAT: SAT, SUN: SUN, shadeClass: shadeClass, instant: instant, LABELS: LABELS };

  if (typeof window === 'undefined') { // Node (checks.mjs): maths only
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.DE = root.DE || {};
    root.DE.hook = api;
    return;
  }

  var canvas, geo = null, colors = null, e = 0, labelMode = 'sat'; // 'sat' | 'sun' | 'both'
  var played = false, visible = false, timer = 0, raf = 0;
  var stats = { draw: [], frames: [] };
  var off = null, lut = null;

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function reduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // Packed ABGR (little-endian) colour per altitude step, from the sky ramp.
  function buildLut() {
    var n = Math.round((ALT_HI - ALT_LO) / ALT_STEP) + 1;
    lut = new Uint32Array(n);
    for (var i = 0; i < n; i++) {
      var c = root.DE.sky.colour(ALT_LO + i * ALT_STEP);
      lut[i] = (255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0];
    }
  }

  function layout(cssW, cssH) {
    var b = geo.bbox, lonC = (b[0] + b[2]) / 2, latC = (b[1] + b[3]) / 2;
    var availW = cssW - 2 * PAD, availH = cssH - LABEL_H - 2 * PAD;
    var s = Math.min(availW / ((b[2] - b[0]) * K), availH / (b[3] - b[1]));
    return { lonC: lonC, latC: latC, s: s, cx: cssW / 2, cy: PAD + availH / 2 };
  }

  function draw() {
    if (!canvas || !geo) return;
    var t0 = performance.now();
    if (!colors) colors = { line: css('--muted'), ink: css('--ink'), mute: css('--muted') };
    var dpr = window.devicePixelRatio || 1;
    var cssW = canvas.clientWidth, cssH = canvas.clientHeight;
    var W = Math.round(cssW * dpr), H = Math.round(cssH * dpr);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    var L = layout(cssW, cssH);
    function px(p) { return [L.cx + (p[0] - L.lonC) * K * L.s, L.cy - (p[1] - L.latC) * L.s]; }
    function path() {
      ctx.beginPath();
      geo.polygons.forEach(function (ring) {
        ring.forEach(function (p, i) { var q = px(p); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
        ctx.closePath();
      });
    }

    // Outline: a thick stroke under the fill leaves a clean silhouette edge and
    // hides the Republic / Northern Ireland border.
    path();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = colors.line;
    ctx.stroke();

    // Shading: altitude on a coarse lattice, interpolated to 1 css px, coloured
    // through a lookup table, then scaled up inside the land clip.
    var b = geo.bbox;
    var tl = px([b[0], b[3]]), br = px([b[2], b[1]]);
    var bw = br[0] - tl[0], bh = br[1] - tl[1];
    var ow = Math.max(1, Math.ceil(bw)), oh = Math.max(1, Math.ceil(bh));
    var lw = Math.max(2, Math.ceil(bw / LATTICE) + 1), lh = Math.max(2, Math.ceil(bh / LATTICE) + 1);
    if (!lut) buildLut();
    if (!off || off.width !== ow || off.height !== oh) {
      off = document.createElement('canvas'); off.width = ow; off.height = oh;
    }
    var tMs = instant(e), sun = root.DE.sun, pos = sun.solarPos(tMs);
    var alts = new Float32Array(lw * lh);
    for (var k = 0; k < lh; k++) {
      var lat = L.latC - (tl[1] + k * bh / (lh - 1) - L.cy) / L.s;
      for (var m = 0; m < lw; m++) {
        var lon = L.lonC + (tl[0] + m * bw / (lw - 1) - L.cx) / (K * L.s);
        alts[k * lw + m] = sun.altitudeAt(pos, tMs, lat, lon);
      }
    }
    var octx = off.getContext('2d'), img = octx.createImageData(ow, oh), px32 = new Uint32Array(img.data.buffer);
    var x0 = new Int32Array(ow), tx = new Float32Array(ow);
    for (var i = 0; i < ow; i++) {
      var u = (i + 0.5) / ow * (lw - 1), iu = Math.min(lw - 2, Math.floor(u));
      x0[i] = iu; tx[i] = u - iu;
    }
    var nLut = lut.length - 1, inv = 1 / ALT_STEP;
    for (var j = 0; j < oh; j++) {
      var v = (j + 0.5) / oh * (lh - 1), jv = Math.min(lh - 2, Math.floor(v)), ty = v - jv;
      var r0 = jv * lw, r1 = r0 + lw;
      for (var q = 0; q < ow; q++) {
        var c0 = x0[q], f = tx[q];
        var top = alts[r0 + c0] + (alts[r0 + c0 + 1] - alts[r0 + c0]) * f;
        var bot = alts[r1 + c0] + (alts[r1 + c0 + 1] - alts[r1 + c0]) * f;
        var idx = ((top + (bot - top) * ty - ALT_LO) * inv) | 0;
        px32[j * ow + q] = lut[idx < 0 ? 0 : idx > nLut ? nLut : idx];
      }
    }
    octx.putImageData(img, 0, 0);
    ctx.save();
    path();
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(off, tl[0], tl[1], bw, bh);
    ctx.restore();

    // Labels, on the graphic.
    ctx.font = '500 16px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'alphabetic';
    var by = cssH - 22;
    function lab(text, x, align, on) {
      ctx.textAlign = align;
      ctx.fillStyle = on ? colors.ink : colors.mute;
      ctx.fillText(text, x, by);
    }
    lab(LABELS[0], PAD, 'left', labelMode === 'sat' || labelMode === 'both');
    lab(LABELS[1], cssW - PAD, 'right', labelMode === 'sun' || labelMode === 'both');

    stats.draw.push(performance.now() - t0);
  }

  function slide() {
    var t0 = 0, last = 0;
    function step(now) {
      if (!t0) t0 = now;
      if (last) stats.frames.push(now - last);
      last = now;
      var p = Math.min(1, (now - t0) / SLIDE_MS);
      e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      labelMode = p >= 0.5 ? 'sun' : 'sat';
      draw();
      if (p < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
  }

  function play() {
    if (played || !geo) return;
    played = true;
    if (reduced()) { e = 1; labelMode = 'both'; draw(); return; }
    e = 0; labelMode = 'sat'; draw();
    timer = setTimeout(slide, HOLD_MS);
  }
  // Auto-play once, when the data is loaded and the canvas is in view.
  function maybePlay() { if (!played && geo && visible) play(); }

  // Start over from Saturday (user-triggered). No-op under reduced motion.
  function replay() {
    if (!geo || reduced()) return;
    played = true;
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    stats.draw.length = 0; stats.frames.length = 0;
    e = 0; labelMode = 'sat'; draw();
    timer = setTimeout(slide, HOLD_MS);
  }

  function init(el) {
    canvas = el;
    var fonts = (document.fonts && document.fonts.load) ? document.fonts.load('500 16px Inter').catch(function () {}) : Promise.resolve();
    var data = fetch('data/ireland.json').then(function (r) { return r.json(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[entries.length - 1].isIntersecting;
        maybePlay();
      }, { threshold: 0.6 }).observe(canvas);
    } else {
      visible = true;
    }
    Promise.all([data, fonts]).then(function (res) { geo = res[0]; maybePlay(); }, function () { /* hook stays blank; page still works */ });
  }

  api.init = init;
  api.replay = replay;
  api.progress = function () { return { e: e, label: labelMode, played: played }; };
  api.redraw = function () { if (geo) draw(); };
  api.width = function () { return canvas ? canvas.clientWidth : 0; };
  api.size = function () { return canvas ? canvas.clientWidth + 'x' + canvas.clientHeight : ''; };
  api.stats = stats;
  root.DE = root.DE || {};
  root.DE.hook = api;
})(typeof window !== 'undefined' ? window : globalThis);
