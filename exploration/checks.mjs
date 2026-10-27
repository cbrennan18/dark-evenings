// Acceptance checks for docs/js/sun.js and docs/js/regimes.js.
// Run: node exploration/checks.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const js = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'js');
const sun = require(path.join(js, 'sun.js'));
const regimes = require(path.join(js, 'regimes.js'));

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

process.exit(failed ? 1 : 0);
