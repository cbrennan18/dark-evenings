// Clock regimes (current / permanent summer / permanent winter) and the
// dark-morning / dark-evening count.
(function (root) {
  var DAY = 86400000;
  var DARK_DEG = -6;
  var fmts = {};

  function sun() { return root.DE.sun; }

  // UTC offset in minutes for an IANA zone at a UTC instant, via Intl.
  function offsetMin(tz, utcMs) {
    var f = fmts[tz] || (fmts[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }));
    var parts = f.formatToParts(new Date(utcMs));
    var name = '';
    for (var i = 0; i < parts.length; i++) if (parts[i].type === 'timeZoneName') name = parts[i].value;
    var m = /GMT([+\-−])(\d{1,2})(?::(\d{2}))?/.exec(name);
    if (!m) return 0;
    var mins = parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0);
    return m[1] === '+' ? mins : -mins;
  }

  // Smallest and largest offset over [fromMs, toMs] (sampled weekly).
  function regimeOffsets(tz, fromMs, toMs) {
    var lo = Infinity, hi = -Infinity;
    for (var t = fromMs; t <= toMs + 7 * DAY; t += 7 * DAY) {
      var o = offsetMin(tz, t);
      if (o < lo) lo = o;
      if (o > hi) hi = o;
    }
    return { winter: lo, summer: hi };
  }

  // Wall-clock minutes-of-day on a calendar date (dateMs = UTC midnight of
  // that date) to a UTC instant. fixedOffset: minutes, or null for the zone's
  // real rules.
  function wallToUtc(tz, dateMs, minutes, fixedOffset) {
    var naive = dateMs + minutes * 60000;
    if (fixedOffset != null) return naive - fixedOffset * 60000;
    var guess = naive - offsetMin(tz, naive) * 60000;
    return naive - offsetMin(tz, guess) * 60000;
  }

  function parseDate(s) {
    var p = s.split('-');
    return Date.UTC(+p[0], +p[1] - 1, +p[2]);
  }

  // Lowest solar altitude over a wall-clock window [a, b] minutes on a date.
  // Samples every minute, both ends included.
  function minAlt(o, dateMs, a, b) {
    var s = sun(), lo = Infinity;
    var n = Math.max(0, Math.round(b - a));
    for (var i = 0; i <= n; i++) {
      var t = wallToUtc(o.tz, dateMs, a + i, o.fixedOffset);
      var alt = s.altitude(t, o.lat, o.lon);
      if (alt < lo) lo = alt;
    }
    return lo;
  }

  // o: {lat, lon, tz, startMin, finishMin, commuteMin, from, to ('YYYY-MM-DD'),
  //     regime: 'current'|'summer'|'winter'}
  // Weekdays only. Returns {mornings, evenings, days:[{ms, mDark, eDark}]}.
  function countDark(o) {
    var from = parseDate(o.from), to = parseDate(o.to);
    var fixed = null;
    if (o.regime !== 'current') {
      var offs = regimeOffsets(o.tz, from, to);
      fixed = o.regime === 'summer' ? offs.summer : offs.winter;
    }
    var q = { tz: o.tz, lat: o.lat, lon: o.lon, fixedOffset: fixed };
    var res = { mornings: 0, evenings: 0, days: [], fixedOffset: fixed };
    for (var d = from; d <= to; d += DAY) {
      var dow = new Date(d).getUTCDay();
      if (dow === 0 || dow === 6) continue;
      var mDark = minAlt(q, d, o.startMin - o.commuteMin, o.startMin) < DARK_DEG;
      var eDark = minAlt(q, d, o.finishMin, o.finishMin + o.commuteMin) < DARK_DEG;
      if (mDark) res.mornings++;
      if (eDark) res.evenings++;
      res.days.push({ ms: d, mDark: mDark, eDark: eDark });
    }
    return res;
  }

  var api = {
    offsetMin: offsetMin,
    regimeOffsets: regimeOffsets,
    wallToUtc: wallToUtc,
    parseDate: parseDate,
    countDark: countDark
  };
  root.DE = root.DE || {};
  root.DE.regimes = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
