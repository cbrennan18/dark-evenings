// Year strip: weekdays across, clock time down. Night / twilight / day bands
// follow the sun under the chosen clock regime; two commute bars sit on top
// (orange where any part of that day's trip is in the dark).
// Drawn in device pixels with integer edges, so adjacent columns share exact
// borders and no hairlines appear.
(function (root) {
  var REGIMES = ['current', 'summer']; // permanent winter stays in regimes.js, not in the UI
  var STRIP_H = 230;      // css px, bands area
  var MONTH_H = 30;       // css px, month labels below
  var BAR_MIN = 7;        // css px
  var LABEL_H = 20;       // css px of headroom for a time label above a bar
  var TWEEN_MS = 400;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var FONT = 'Inter, system-ui, sans-serif';

  var canvas = null;
  var colors = null;
  var data = null;        // prepared inputs and per-regime band arrays
  var key = null;
  var shown = null;       // band arrays currently on screen
  var shownFlags = null;  // {m:[], e:[]} dark flags currently on screen
  var regime = 'current';
  var raf = 0;
  var drawn = { w: 0 };

  function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function readColors() {
    colors = {
      night: css('--night'), twilight: css('--twilight'), day: css('--day'),
      bar: css('--bar'), orange: css('--orange'), ink: css('--ink'), muted: css('--muted')
    };
  }
  function reduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function hhmm(min) {
    var m = ((Math.round(min) % 1440) + 1440) % 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }

  // ---- data ----
  // Wall-clock minutes (from local midnight) at which the sun crosses
  // -6 deg (civil dawn), -0.833 deg (sunrise), -0.833 (sunset), -6 (civil dusk).
  function bandsFor(o, r, flags) {
    var R = root.DE.regimes, S = root.DE.sun;
    var from = R.parseDate(o.from), to = R.parseDate(o.to);
    var fixed = null;
    if (r !== 'current') {
      var offs = R.regimeOffsets(o.tz, from, to);
      fixed = r === 'summer' ? offs.summer : offs.winter;
    }
    var n = flags.length;
    var out = { a: new Float32Array(n), b: new Float32Array(n), c: new Float32Array(n), d: new Float32Array(n) };
    var i = 0;
    for (var d = from; d <= to; d += 86400000) {
      var dow = new Date(d).getUTCDay();
      if (dow === 0 || dow === 6) continue;
      var ev = [
        S.eventTime(d, o.lat, o.lon, 96, true),
        S.eventTime(d, o.lat, o.lon, 90.833, true),
        S.eventTime(d, o.lat, o.lon, 90.833, false),
        S.eventTime(d, o.lat, o.lon, 96, false)
      ];
      var vals = ev.map(function (ms) {
        if (isNaN(ms)) return NaN;
        var off = fixed != null ? fixed : R.offsetMin(o.tz, ms);
        return (ms + off * 60000 - d) / 60000;
      });
      if (vals.some(isNaN)) { // polar day / night fallback
        var up = S.altitude(d + 12 * 3600000 - o.lon * 240000, o.lat, o.lon) > -0.833;
        vals = up ? [0, 0, 1440, 1440] : [720, 720, 720, 720];
      }
      out.a[i] = vals[0]; out.b[i] = vals[1]; out.c[i] = vals[2]; out.d[i] = vals[3];
      i++;
    }
    return out;
  }

  function prepare(o) {
    var R = root.DE.regimes;
    data = { o: o, regimes: {} };
    REGIMES.forEach(function (r) {
      var res = R.countDark(Object.assign({}, o, { regime: r }));
      var flags = { m: [], e: [] };
      res.days.forEach(function (day) { flags.m.push(day.mDark); flags.e.push(day.eDark); });
      data.regimes[r] = { flags: flags, bands: bandsFor(o, r, res.days), counts: { mornings: res.mornings, evenings: res.evenings } };
    });
    data.n = data.regimes.current.flags.m.length;
    // Month label anchors: first weekday of each month, only if it falls on day 1-3.
    data.months = [];
    var from = R.parseDate(o.from), to = R.parseDate(o.to), i = 0, last = -1;
    for (var d = from; d <= to; d += 86400000) {
      var dt = new Date(d), dow = dt.getUTCDay();
      if (dow === 0 || dow === 6) continue;
      var mo = dt.getUTCMonth() + dt.getUTCFullYear() * 12;
      if (mo !== last) {
        last = mo;
        if (dt.getUTCDate() <= 3) {
          data.months.push({ i: i, name: MONTHS[dt.getUTCMonth()] });
        }
      }
      i++;
    }
  }

  // ---- layout ----
  function yRange(o) {
    // Default 06:00-20:00, widened to whole hours so both bars and their
    // labels fit. Bar thickness is at least BAR_MIN css px, so convert using
    // the current minutes-per-pixel (two passes settle it).
    var mTop = o.startMin - o.commuteMin, eTop = o.finishMin;
    var lo = 360, hi = 1200;
    for (var k = 0; k < 3; k++) {
      var perPx = (hi - lo) / STRIP_H;
      var barMin = Math.max(BAR_MIN * perPx, 0);
      var eBottom = eTop + Math.max(o.commuteMin, barMin);
      var mBottom = o.startMin + Math.max(0, barMin - o.commuteMin);
      lo = Math.min(360, Math.floor((mTop - LABEL_H * perPx) / 60) * 60);
      hi = Math.max(1200, Math.ceil(Math.max(eBottom, mBottom) / 60) * 60);
    }
    return { lo: Math.max(0, lo), hi: Math.min(1440, hi) };
  }

  function lerpBands(a, b, t) {
    var out = {};
    ['a', 'b', 'c', 'd'].forEach(function (k) {
      var arr = new Float32Array(a[k].length);
      for (var i = 0; i < arr.length; i++) arr[i] = a[k][i] + (b[k][i] - a[k][i]) * t;
      out[k] = arr;
    });
    return out;
  }

  // ---- drawing ----
  function render() {
    if (!canvas || !data) return;
    if (!colors) readColors();
    var o = data.o, n = data.n;
    var dpr = window.devicePixelRatio || 1;
    var cssW = canvas.clientWidth;
    var W = Math.round(cssW * dpr);
    var plotH = Math.round(STRIP_H * dpr);
    var H = Math.round((STRIP_H + MONTH_H) * dpr);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    drawn.w = cssW;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!n) return;

    var rng = yRange(o);
    var span = rng.hi - rng.lo;
    function y(min) {
      var v = Math.round((min - rng.lo) / span * plotH);
      return v < 0 ? 0 : v > plotH ? plotH : v;
    }
    function x(i) { return Math.round(i * W / n); }

    // bands
    var s = shown;
    for (var i = 0; i < n; i++) {
      var x0 = x(i), w = x(i + 1) - x0;
      ctx.fillStyle = colors.night;
      ctx.fillRect(x0, 0, w, plotH);
      var ya = y(s.a[i]), yd = y(s.d[i]);
      ctx.fillStyle = colors.twilight;
      ctx.fillRect(x0, ya, w, yd - ya);
      var yb = y(s.b[i]), yc = y(s.c[i]);
      ctx.fillStyle = colors.day;
      ctx.fillRect(x0, yb, w, yc - yb);
    }

    // commute bars
    var minBar = Math.round(BAR_MIN * dpr);
    var bars = [
      { top: o.startMin - o.commuteMin, flags: shownFlags.m },
      { top: o.finishMin, flags: shownFlags.e }
    ];
    bars.forEach(function (bar) {
      var y0 = y(bar.top);
      var y1 = y(bar.top + o.commuteMin);
      var h = Math.max(minBar, y1 - y0);
      bar.y0 = y0;
      for (var i = 0; i < n; i++) {
        ctx.fillStyle = bar.flags[i] ? colors.orange : colors.bar;
        var x0 = x(i);
        ctx.fillRect(x0, y0, x(i + 1) - x0, h);
      }
    });

    // time labels: right-aligned just above each bar; ink or night by band underneath
    ctx.font = '500 ' + Math.round(14 * dpr) + 'px ' + FONT;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    var pad = Math.round(6 * dpr);
    [[bars[0], o.startMin - o.commuteMin], [bars[1], o.finishMin]].forEach(function (pair) {
      var bar = pair[0], text = hhmm(pair[1]);
      var tw = ctx.measureText(text).width;
      var base = bar.y0 - Math.round(4 * dpr);
      var mid = base - Math.round(5 * dpr);
      var minuteAt = rng.lo + (mid / plotH) * span;
      var first = Math.max(0, Math.floor((W - pad - tw) * n / W));
      var dayCols = 0, cols = 0;
      for (var i = first; i < n; i++) {
        cols++;
        if (minuteAt >= s.b[i] && minuteAt <= s.c[i]) dayCols++;
      }
      ctx.fillStyle = dayCols * 2 > cols ? colors.night : colors.ink;
      ctx.fillText(text, W - pad, base);
    });

    // month labels: greedy, no overlap, clamped inside
    ctx.font = '400 ' + Math.round(14 * dpr) + 'px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillStyle = colors.muted;
    var gap = 8 * dpr;
    var labels = [];
    var steps = [1, 2, 3, 4, 6, 12];
    for (var si = 0; si < steps.length && !labels.length; si++) {
      var cand = [], ok = true, prevEnd = -Infinity;
      for (var m = 0; m < data.months.length; m += steps[si]) {
        var mo = data.months[m], tw2 = ctx.measureText(mo.name).width;
        var lx = Math.min(x(mo.i), W - tw2);
        if (lx < prevEnd + gap) { ok = false; break; }
        cand.push({ name: mo.name, x: lx });
        prevEnd = lx + tw2;
      }
      if (ok) labels = cand;
    }
    var by = plotH + Math.round(22 * dpr);
    labels.forEach(function (l) { ctx.fillText(l.name, l.x, by); });
  }

  // ---- public ----
  function setShown(r) {
    shown = data.regimes[r].bands;
    shownFlags = data.regimes[r].flags;
  }

  function tweenTo(r) {
    cancelAnimationFrame(raf);
    var target = data.regimes[r];
    if (reduced()) { setShown(r); render(); return; }
    var from = shown, t0 = performance.now();
    function step(now) {
      var p = Math.min(1, (now - t0) / TWEEN_MS);
      var e = 1 - Math.pow(1 - p, 3);
      if (p >= 1) { setShown(r); render(); return; }
      shown = lerpBands(from, target.bands, e);
      render();
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
  }

  function init(el) { canvas = el; }

  // o: inputs without regime. Rebuilds only if the inputs changed; a regime
  // change on the same inputs just slides the bands.
  function update(o, r) {
    var k = JSON.stringify([o.lat, o.lon, o.tz, o.startMin, o.finishMin, o.commuteMin, o.from, o.to]);
    if (k !== key) {
      key = k;
      cancelAnimationFrame(raf);
      prepare(o);
      regime = r;
      setShown(r);
      render();
      return data;
    }
    if (r !== regime) { regime = r; tweenTo(r); }
    return data;
  }

  function redraw() { if (data) render(); }
  function width() { return canvas ? canvas.clientWidth : 0; }

  root.DE = root.DE || {};
  root.DE.strip = { init: init, update: update, redraw: redraw, width: width, counts: function (r) { return data && data.regimes[r].counts; } };
})(window);
