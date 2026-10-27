// Rough year strip: x = weekday, y = clock time under the chosen regime.
// Commute windows are coloured dark / twilight / light by solar altitude.
(function (root) {
  var COLORS = { dark: '#1b1f4b', twilight: '#e08a2e', light: '#f2d94e' };
  var MARGIN_L = 40, MARGIN_B = 22, MARGIN_T = 6, MIN_BAR = 6;

  function classify(alt) {
    return alt < -6 ? 'dark' : alt < -0.833 ? 'twilight' : 'light';
  }

  // o: same fields as regimes.countDark
  function draw(canvas, o) {
    var R = root.DE.regimes, S = root.DE.sun;
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var from = R.parseDate(o.from), to = R.parseDate(o.to);
    var fixed = null;
    if (o.regime !== 'current') {
      var offs = R.regimeOffsets(o.tz, from, to);
      fixed = o.regime === 'summer' ? offs.summer : offs.winter;
    }
    var days = [];
    for (var d = from; d <= to; d += 86400000) {
      var dow = new Date(d).getUTCDay();
      if (dow !== 0 && dow !== 6) days.push(d);
    }
    var plotW = w - MARGIN_L, plotH = h - MARGIN_B - MARGIN_T;
    var colW = plotW / days.length;
    function y(min) { return MARGIN_T + (min / 1440) * plotH; }

    ctx.fillStyle = '#eee';
    ctx.fillRect(MARGIN_L, MARGIN_T, plotW, plotH);

    function windowRuns(dateMs, a, b, x) {
      var n = Math.max(0, Math.round(b - a)), runStart = 0, runCls = null;
      for (var i = 0; i <= n + 1; i++) {
        var cls = null;
        if (i <= n) {
          var t = R.wallToUtc(o.tz, dateMs, a + i, fixed);
          cls = classify(S.altitude(t, o.lat, o.lon));
        }
        if (cls !== runCls) {
          if (runCls) {
            var y0 = y(a + runStart), y1 = y(a + i);
            ctx.fillStyle = COLORS[runCls];
            ctx.fillRect(x, y0, Math.max(1, colW), Math.max(MIN_BAR / 2, y1 - y0));
          }
          runStart = i; runCls = cls;
        }
      }
    }

    for (var j = 0; j < days.length; j++) {
      var x = MARGIN_L + j * colW;
      windowRuns(days[j], o.startMin - o.commuteMin, o.startMin, x);
      windowRuns(days[j], o.finishMin, o.finishMin + o.commuteMin, x);
    }

    // start / finish guides
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    [o.startMin, o.finishMin].forEach(function (m) {
      ctx.beginPath();
      ctx.moveTo(MARGIN_L, y(m) + 0.5);
      ctx.lineTo(w, y(m) + 0.5);
      ctx.stroke();
    });

    // axes
    ctx.fillStyle = '#222';
    ctx.font = '14px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    [0, 6, 12, 18, 24].forEach(function (hr) {
      ctx.fillText(String(hr).padStart(2, '0') + ':00', MARGIN_L - 4, y(hr * 60));
    });
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    var lastMonth = -1;
    for (var k = 0; k < days.length; k++) {
      var dt = new Date(days[k]), mo = dt.getUTCMonth();
      if (mo !== lastMonth) {
        lastMonth = mo;
        var label = dt.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
        var lx = MARGIN_L + k * colW;
        if (lx + 28 < w) ctx.fillText(label, lx, h - 4);
      }
    }
  }

  root.DE = root.DE || {};
  root.DE.strip = { draw: draw, COLORS: COLORS };
})(window);
