// Acceptance checks for docs/js/sun.js, regimes.js and sky.js.
// Run: node exploration/checks.mjs
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const js = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'js');
const sun = require(path.join(js, 'sun.js'));
const regimes = require(path.join(js, 'regimes.js'));
const sky = require(path.join(js, 'sky.js'));

const CORK = { lat: 51.897968, lon: -8.47061, tz: 'Europe/Dublin' };
let failed = false;

function hms(ms, tz) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(new Date(ms));
}
function secs(s) { const [h, m, x] = s.split(':').map(Number); return h * 3600 + m * 60 + x; }

// 1. Sun times, Cork, 24 Oct 2026 (IST = UTC+1).
const day = Date.UTC(2026, 9, 24);
const expected = { sunrise: '08:14:05', sunset: '18:21:11', 'civil dusk': '18:55:51' };
const got = {
  sunrise: sun.sunrise(day, CORK.lat, CORK.lon),
  sunset: sun.sunset(day, CORK.lat, CORK.lon),
  'civil dusk': sun.civilDusk(day, CORK.lat, CORK.lon)
};
console.log('Sun times, Cork, 24 Oct 2026 (IST)');
for (const k of Object.keys(expected)) {
  const g = hms(got[k], CORK.tz);
  const delta = secs(g) - secs(expected[k]);
  const ok = Math.abs(delta) <= 60;
  if (!ok) failed = true;
  console.log(`  ${k.padEnd(10)} got ${g}  expected ${expected[k]}  delta ${delta >= 0 ? '+' : ''}${delta}s  ${ok ? 'PASS' : 'FAIL'}`);
}

// 2. Dark evening counts, commute 0, finish 17:30, 26 Oct 2026 – 25 Oct 2027.
console.log('\nDark counts, Cork, commute 0, 09:00–17:30, 2026-10-26 to 2027-10-25');
const counts = {};
for (const regime of ['current', 'summer', 'winter']) {
  const t0 = performance.now();
  const r = regimes.countDark({
    ...CORK, startMin: 540, finishMin: 1050, commuteMin: 0,
    from: '2026-10-26', to: '2027-10-25', regime
  });
  const ms = performance.now() - t0;
  counts[regime] = r;
  console.log(`  ${regime.padEnd(8)} mornings ${String(r.mornings).padStart(3)}  evenings ${String(r.evenings).padStart(3)}  weekdays ${r.days.length}  offset ${r.fixedOffset ?? 'tz rules'}  ${ms.toFixed(0)} ms`);
}
const checks = [
  ['current evenings = 49', counts.current.evenings === 49],
  ['summer evenings = 0', counts.summer.evenings === 0]
];
for (const [name, ok] of checks) {
  if (!ok) failed = true;
  console.log(`  ${name}: ${ok ? 'PASS' : 'FAIL'}`);
}

// 2b. Sky calendar: cells below -6 deg (altitude at departure / arrival) must
// equal countDark's mornings / evenings, both regimes, Cork 09:00-17:30.
console.log('\nSky calendar cells below -6 deg vs countDark, Cork, 09:00-17:30');
for (const commuteMin of [0, 20]) {
  for (const regime of ['current', 'summer']) {
    const o = { ...CORK, startMin: 540, finishMin: 1050, commuteMin, from: '2026-10-26', to: '2027-10-25' };
    const t0 = performance.now();
    const c = sky.cells(o, regime);
    const ms = performance.now() - t0;
    const d = regimes.countDark({ ...o, regime });
    const ok = c.mornings === d.mornings && c.evenings === d.evenings && c.ms.length === d.days.length;
    if (!ok) failed = true;
    console.log(`  commute ${String(commuteMin).padStart(2)} ${regime.padEnd(8)} cells m ${c.mornings} e ${c.evenings}  countDark m ${d.mornings} e ${d.evenings}  cells ${c.ms.length}  ${ms.toFixed(0)} ms  ${ok ? 'PASS' : 'FAIL'}`);
  }
}

// 3. Hook shading: share of Ireland (grid points inside the outline) that is
// lit / twilight (sun < -0.833) / night (sun < -6) at the two hook instants.
// Informational: prints the split, asserts nothing.
const hook = require(path.join(js, 'hook.js'));
const ireland = JSON.parse(fs.readFileSync(path.join(js, '..', 'data', 'ireland.json'), 'utf8'));

function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

console.log('\nHook shading over Ireland (grid 0.02 deg, points inside outline)');
const [x0, y0, x1, y1] = ireland.bbox;
const instants = [['Sat 24 Oct 18:00 IST (17:00 UTC)', hook.SAT], ['Sun 25 Oct 18:00 GMT (18:00 UTC)', hook.SUN]];
for (const [name, t] of instants) {
  const n = [0, 0, 0];
  for (let lat = y0; lat <= y1; lat += 0.02) {
    for (let lon = x0; lon <= x1; lon += 0.02) {
      if (!ireland.polygons.some((r) => inRing(lon, lat, r))) continue;
      n[hook.shadeClass(sun.altitude(t, lat, lon))]++;
    }
  }
  const tot = n[0] + n[1] + n[2];
  const pct = (v) => (100 * v / tot).toFixed(1).padStart(5) + '%';
  console.log(`  ${name.padEnd(34)} lit ${pct(n[0])}  twilight ${pct(n[1])}  night ${pct(n[2])}  (${tot} points)`);
}

process.exit(failed ? 1 : 0);
