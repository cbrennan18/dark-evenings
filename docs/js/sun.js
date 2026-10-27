// NOAA solar calculator method. Event times are iterated: declination and
// equation of time are re-evaluated at the candidate event time.
// Altitude is geometric (no refraction).
(function (root) {
  var RAD = Math.PI / 180;
  var DEG = 180 / Math.PI;

  function mod(a, n) { return ((a % n) + n) % n; }

  // Declination (deg) and equation of time (minutes) at a UTC instant.
  function solarPos(tMs) {
    var jd = tMs / 86400000 + 2440587.5;
    var T = (jd - 2451545) / 36525;
    var L0 = mod(280.46646 + T * (36000.76983 + T * 0.0003032), 360);
    var M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
    var e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
    var Mr = M * RAD;
    var C = Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
      Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) +
      Math.sin(3 * Mr) * 0.000289;
    var trueLong = L0 + C;
    var omega = 125.04 - 1934.136 * T;
    var lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
    var eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
    var eps = eps0 + 0.00256 * Math.cos(omega * RAD);
    var decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD)) * DEG;
    var y = Math.pow(Math.tan(eps * RAD / 2), 2);
    var L0r = L0 * RAD;
    var eqTime = 4 * DEG * (
      y * Math.sin(2 * L0r) -
      2 * e * Math.sin(Mr) +
      4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) -
      0.5 * y * y * Math.sin(4 * L0r) -
      1.25 * e * e * Math.sin(2 * Mr));
    return { decl: decl, eqTime: eqTime };
  }

  // Solar elevation in degrees at a UTC instant.
  function altitude(tMs, lat, lon) {
    var p = solarPos(tMs);
    var utcMin = mod(tMs, 86400000) / 60000;
    var tst = mod(utcMin + p.eqTime + 4 * lon, 1440);
    var ha = tst / 4 - 180;
    var cosZ = Math.sin(lat * RAD) * Math.sin(p.decl * RAD) +
      Math.cos(lat * RAD) * Math.cos(p.decl * RAD) * Math.cos(ha * RAD);
    return 90 - Math.acos(Math.max(-1, Math.min(1, cosZ))) * DEG;
  }

  // UTC ms of the sun crossing zenith angle `zenith` (90.833 sunrise/sunset,
  // 96 civil) on the calendar date `dateMs` (UTC midnight of that date).
  // Returns NaN if it doesn't happen.
  function eventTime(dateMs, lat, lon, zenith, rising) {
    var t = dateMs + (720 - 4 * lon) * 60000; // solar noon estimate
    for (var i = 0; i < 4; i++) {
      var p = solarPos(t);
      var cosHa = Math.cos(zenith * RAD) / (Math.cos(lat * RAD) * Math.cos(p.decl * RAD)) -
        Math.tan(lat * RAD) * Math.tan(p.decl * RAD);
      if (cosHa < -1 || cosHa > 1) return NaN;
      var ha = Math.acos(cosHa) * DEG;
      var min = 720 - 4 * (lon + (rising ? ha : -ha)) - p.eqTime;
      t = dateMs + min * 60000;
    }
    return t;
  }

  var api = {
    solarPos: solarPos,
    altitude: altitude,
    eventTime: eventTime,
    sunrise: function (d, lat, lon) { return eventTime(d, lat, lon, 90.833, true); },
    sunset: function (d, lat, lon) { return eventTime(d, lat, lon, 90.833, false); },
    civilDawn: function (d, lat, lon) { return eventTime(d, lat, lon, 96, true); },
    civilDusk: function (d, lat, lon) { return eventTime(d, lat, lon, 96, false); }
  };
  root.DE = root.DE || {};
  root.DE.sun = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
