// Photon place search and Valhalla routing (FOSSGIS). Both resolve to null /
// [] on any failure; nothing here throws or shows UI.
(function (root) {
  var VALHALLA = 'https://valhalla1.openstreetmap.de/route';
  var PHOTON = 'https://photon.komoot.io/api/';
  var COSTING = { car: 'auto', bike: 'bicycle', walk: 'pedestrian' };

  function fetchJson(url, ms) {
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, ms);
    return fetch(url, { signal: ctl.signal })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .finally(function () { clearTimeout(timer); });
  }

  // Valhalla encodes shapes as polyline with 6 decimal places.
  function decodePolyline6(str) {
    var out = [], i = 0, lat = 0, lon = 0;
    while (i < str.length) {
      for (var k = 0; k < 2; k++) {
        var shift = 0, result = 0, b;
        do {
          b = str.charCodeAt(i++) - 63;
          result |= (b & 0x1f) << shift;
          shift += 5;
        } while (b >= 0x20);
        var d = (result & 1) ? ~(result >> 1) : (result >> 1);
        if (k === 0) lat += d; else lon += d;
      }
      out.push([lon / 1e6, lat / 1e6]);
    }
    return out;
  }

  // -> Promise<{minutes, coords:[[lon,lat],...]} | null>
  function route(from, to, mode) {
    var json = JSON.stringify({
      locations: [{ lat: from.lat, lon: from.lon }, { lat: to.lat, lon: to.lon }],
      costing: COSTING[mode] || 'auto'
    });
    return fetchJson(VALHALLA + '?json=' + encodeURIComponent(json), 8000)
      .then(function (data) {
        var trip = data && data.trip;
        if (!trip || !trip.summary || !trip.legs || !trip.legs[0]) return null;
        return {
          minutes: Math.max(1, Math.round(trip.summary.time / 60)),
          coords: decodePolyline6(trip.legs[0].shape)
        };
      })
      .catch(function () { return null; });
  }

  // -> Promise<[{label, lat, lon}]>
  function search(q) {
    return fetchJson(PHOTON + '?limit=5&q=' + encodeURIComponent(q), 6000)
      .then(function (data) {
        return (data.features || []).map(function (f) {
          var p = f.properties || {};
          var label = [p.name, p.street, p.city || p.county, p.country]
            .filter(function (x, i, a) { return x && a.indexOf(x) === i; }).join(', ');
          return { label: label, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] };
        });
      })
      .catch(function () { return []; });
  }

  root.DE = root.DE || {};
  root.DE.route = { route: route, search: search, decodePolyline6: decodePolyline6 };
})(window);
