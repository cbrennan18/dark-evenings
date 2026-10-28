// Sky calendar: one cell per weekday, split on the diagonal. Top-left triangle
// is the sky at the morning departure, bottom-right the sky at the evening
// arrival, coloured by solar altitude. Months sit in a 3-column grid, each
// 5 columns (Mon-Fri) by week rows.
// Drawn in device pixels with integer edges so cells are crisp at any DPR.
(function (root) {
  var REGIMES = ['current', 'summer']; // permanent winter stays in regimes.js, not in the UI
  var DAY = 86400000;
  var DARK_DEG = -6;
  var GAP = 2;            // css px between cells
  var RADIUS = 2;         // css px
  var MONTH_GAP = 12;     // css px between month blocks across
  var ROW_GAP = 14;       // css px between month rows
  var LABEL_H = 24;       // css px, month label band above each block
  var CAP = 26;           // css px, largest cell on wide screens
  var TWEEN_MS = 400;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var FONT = 'Inter, system-ui, sans-serif';
  var MUTED = '#8f897f';
  var OUTLINE = 'rgba(255,255,255,0.08)';

  // Real-sky ramp, altitude (deg) to colour. Ascending altitude.
  var STOPS = [
    [-12, '#050508'], [-6, '#0b1020'], [-3, '#2b3352'], [0, '#b06a5a'], [4, '#e3b07a'], [12, '#a9bccd']
  ].map(function (s) {
    var h = s[1];
    return { alt: s[0], rgb: [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] };
  });

  function colour(alt) {
    var a = STOPS[0], z = STOPS[STOPS.length - 1];
    if (!(alt > a.alt)) return a.rgb;
    if (alt >= z.alt) return z.rgb;
    for (var i = 1; i < STOPS.length; i++) {
      if (alt <= STOPS[i].alt) {
        var lo = STOPS[i - 1], hi = STOPS[i], t = (alt - lo.alt) / (hi.alt - lo.alt);
        return [
          Math.round(lo.rgb[0] + (hi.rgb[0] - lo.rgb[0]) * t),
          Math.round(lo.rgb[1] + (hi.rgb[1] - lo.rgb[1]) * t),
          Math.round(lo.rgb[2] + (hi.rgb[2] - lo.rgb[2]) * t)
        ];
      }
    }
    return z.rgb;
  }

  // ---- data ----
  // o: {lat, lon, tz, startMin, finishMin, commuteMin, from, to}. Weekdays only.
  // Solar altitude at the departure (start - commute) and arrival
  // (finish + commute) instants. Returns {ms, m, e (deg), mornings, evenings}
  // where the counts are cells below -6 deg.
  function cells(o, regime) {
    var R = root.DE.regimes, S = root.DE.sun;
    var from = R.parseDate(o.from), to = R.parseDate(o.to);
    var fixed = null;
    if (regime !== 'current') {
      var offs = R.regimeOffsets(o.tz, from, to);
      fixed = regime === 'summer' ? offs.summer : offs.winter;
    }
    var ms = [], m = [], e = [], mornings = 0, evenings = 0;
    for (var d = from; d <= to; d += DAY) {
      var dow = new Date(d).getUTCDay();
      if (dow === 0 || dow === 6) continue;
      var ma = S.altitude(R.wallToUtc(o.tz, d, o.startMin - o.commuteMin, fixed), o.lat, o.lon);
      var ea = S.altitude(R.wallToUtc(o.tz, d, o.finishMin + o.commuteMin, fixed), o.lat, o.lon);
      ms.push(d); m.push(ma); e.push(ea);
      if (ma < DARK_DEG) mornings++;
      if (ea < DARK_DEG) evenings++;
    }
    return { ms: ms, m: m, e: e, mornings: mornings, evenings: evenings };
  }

  function rgbArray(alts) {
    var out = new Uint8Array(alts.length * 3);
    for (var i = 0; i < alts.length; i++) {
      var c = colour(alts[i]);
      out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2];
    }
    return out;
  }

  // Month blocks. Rows count weeks from the Monday of the week holding the
  // first in-window weekday of that month, so partial months stay compact.
  function monthsOf(ms) {
    var out = [], cur = null;
    for (var i = 0; i < ms.length; i++) {
      var dt = new Date(ms[i]), key = dt.getUTCFullYear() * 12 + dt.getUTCMonth();
      var dow = dt.getUTCDay(); // 1..5
      if (!cur || cur.key !== key) {
        cur = { key: key, label: MONTHS[dt.getUTCMonth()] + (dt.getUTCMonth() === 0 ? ' ' + dt.getUTCFullYear() : ''), base: ms[i] - (dow - 1) * DAY, rows: 0, cells: [] };
        out.push(cur);
      }
      var row = Math.floor((ms[i] - cur.base) / (7 * DAY));
      cur.cells.push({ i: i, row: row, col: dow - 1 });
      if (row + 1 > cur.rows) cur.rows = row + 1;
    }
    return out;
  }

  // ---- browser state ----
  var canvas = null;
  var data = null;
  var key = null;
  var shown = null;       // {m, e} colour arrays on screen
  var regime = 'current';
  var raf = 0;

  function reduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function prepare(o) {
    var R = root.DE.regimes;
    data = { o: o, regimes: {} };
    REGIMES.forEach(function (r) {
      var c = cells(o, r);
      var counts = R.countDark(Object.assign({}, o, { regime: r }));
      data.regimes[r] = { col: { m: rgbArray(c.m), e: rgbArray(c.e) }, counts: { mornings: counts.mornings, evenings: counts.evenings } };
      if (!data.ms) data.ms = c.ms;
    });
    data.n = data.ms.length;
    data.months = monthsOf(data.ms);
  }

  // ---- drawing ----
  function rrect(ctx, x, y, s, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, s, s, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + s, y, x + s, y + s, r);
    ctx.arcTo(x + s, y + s, x, y + s, r);
    ctx.arcTo(x, y + s, x, y, r);
    ctx.arcTo(x, y, x + s, y, r);
    ctx.closePath();
  }

  function rgb(a, i) { return 'rgb(' + a[i * 3] + ',' + a[i * 3 + 1] + ',' + a[i * 3 + 2] + ')'; }

  function render() {
    if (!canvas || !data || !shown) return;
    var dpr = window.devicePixelRatio || 1;
    var cssW = canvas.clientWidth;
    if (!cssW) return;
    var W = Math.round(cssW * dpr);
    var gap = Math.round(GAP * dpr), mg = Math.round(MONTH_GAP * dpr), rg = Math.round(ROW_GAP * dpr);
    var lab = Math.round(LABEL_H * dpr), rad = Math.round(RADIUS * dpr);
    var cell = Math.min(Math.round(CAP * dpr), Math.floor((W - 2 * mg - 12 * gap) / 15));
    if (cell < 4) cell = 4;
    var block = 5 * cell + 4 * gap;
    var x0 = Math.max(0, Math.floor((W - (3 * block + 2 * mg)) / 2));

    // month grid rows: height of a row of blocks is its tallest month
    var months = data.months, rows = [];
    for (var k = 0; k < months.length; k += 3) {
      var tall = 0;
      for (var j = k; j < Math.min(k + 3, months.length); j++) tall = Math.max(tall, months[j].rows);
      rows.push(tall);
    }
    var H = 0;
    rows.forEach(function (r, ri) { H += lab + r * cell + (r - 1) * gap + (ri < rows.length - 1 ? rg : 0); });

    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    canvas.style.height = (H / dpr) + 'px';
    var ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);

    ctx.font = '400 ' + Math.round(14 * dpr) + 'px ' + FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    var lw = Math.max(1, Math.round(dpr));
    var y0 = 0;
    for (var r0 = 0; r0 < rows.length; r0++) {
      for (var c0 = 0; c0 < 3; c0++) {
        var mo = months[r0 * 3 + c0];
        if (!mo) continue;
        var bx = x0 + c0 * (block + mg);
        ctx.fillStyle = MUTED;
        ctx.fillText(mo.label, bx, y0 + Math.round(16 * dpr));
        for (var q = 0; q < mo.cells.length; q++) {
          var ce = mo.cells[q];
          var cx = bx + ce.col * (cell + gap), cy = y0 + lab + ce.row * (cell + gap);
          ctx.save();
          rrect(ctx, cx, cy, cell, rad);
          ctx.fillStyle = rgb(shown.e, ce.i);
          ctx.fill();
          ctx.clip();
          ctx.beginPath();
          ctx.moveTo(cx, cy); ctx.lineTo(cx + cell, cy); ctx.lineTo(cx, cy + cell); ctx.closePath();
          ctx.fillStyle = rgb(shown.m, ce.i);
          ctx.fill();
          ctx.restore();
          // faint 1 px outline inside the cell so the darkest cells read on the page
          rrect(ctx, cx + lw / 2, cy + lw / 2, cell - lw, Math.max(0, rad - lw / 2));
          ctx.strokeStyle = OUTLINE;
          ctx.lineWidth = lw;
          ctx.stroke();
        }
      }
      y0 += lab + rows[r0] * cell + (rows[r0] - 1) * gap + rg;
    }
  }

  // ---- public ----
  function lerpCols(a, b, t) {
    var out = { m: new Uint8Array(a.m.length), e: new Uint8Array(a.e.length) };
    ['m', 'e'].forEach(function (k) {
      for (var i = 0; i < a[k].length; i++) out[k][i] = Math.round(a[k][i] + (b[k][i] - a[k][i]) * t);
    });
    return out;
  }

  function tweenTo(r) {
    cancelAnimationFrame(raf);
    var target = data.regimes[r].col;
    if (reduced()) { shown = target; render(); return; }
    var from = shown, t0 = performance.now();
    function step(now) {
      var p = Math.min(1, (now - t0) / TWEEN_MS);
      if (p >= 1) { shown = target; render(); return; }
      shown = lerpCols(from, target, 1 - Math.pow(1 - p, 3));
      render();
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
  }

  function init(el) { canvas = el; }

  // o: inputs without regime. Rebuilds only if the inputs changed; a regime
  // change on the same inputs crossfades the colours.
  function update(o, r) {
    var k = JSON.stringify([o.lat, o.lon, o.tz, o.startMin, o.finishMin, o.commuteMin, o.from, o.to]);
    if (k !== key) {
      key = k;
      cancelAnimationFrame(raf);
      prepare(o);
      regime = r;
      shown = data.regimes[r].col;
      render();
      return data;
    }
    if (r !== regime) { regime = r; tweenTo(r); }
    return data;
  }

  function redraw() { if (data) render(); }

  var api = {
    colour: colour,
    cells: cells,
    init: init,
    update: update,
    redraw: redraw,
    counts: function (r) { return data && data.regimes[r].counts; }
  };
  root.DE = root.DE || {};
  root.DE.sky = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
