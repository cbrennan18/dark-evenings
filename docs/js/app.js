// Wiring: map, inputs, routing, counts, strip.
(function () {
  var DE = window.DE;
  var $ = function (id) { return document.getElementById(id); };

  var state = {
    home: { lat: 51.8775545, lon: -8.4358941, label: 'Douglas, Cork' },
    work: { lat: 51.897968, lon: -8.47061, label: 'Patrick Street, Cork' },
    remote: false,
    mode: 'car',
    commute: 20,
    regime: 'current'
  };
  var routeSeq = 0;
  var map, markers = {};

  function hhmm(s) { var p = s.split(':'); return (+p[0]) * 60 + (+p[1]); }
  function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function window12() {
    var a = new Date(), b = new Date(a.getFullYear() + 1, a.getMonth(), a.getDate() - 1);
    return { from: iso(a), to: iso(b) };
  }

  // ---- counts + strip ----
  function inputs(regime) {
    var w = window12();
    var tz = 'UTC';
    try { tz = tzlookup(state.home.lat, state.home.lon); } catch (e) { /* keep UTC */ }
    return {
      lat: state.home.lat, lon: state.home.lon, tz: tz,
      startMin: hhmm($('start').value || '09:00'),
      finishMin: hhmm($('finish').value || '17:30'),
      commuteMin: state.remote ? 0 : state.commute,
      from: w.from, to: w.to, regime: regime
    };
  }

  var lastStripWidth = 0;
  function recompute() {
    var res = {};
    ['current', 'summer', 'winter'].forEach(function (r) {
      res[r] = DE.regimes.countDark(inputs(r));
      $('n-' + r).textContent = '(' + res[r].mornings + ' mornings, ' + res[r].evenings + ' evenings)';
    });
    var sel = res[state.regime];
    $('n-morning').textContent = sel.mornings;
    $('n-evening').textContent = sel.evenings;
    var o = inputs(state.regime);
    $('tz-note').textContent = o.tz;
    lastStripWidth = $('strip').clientWidth;
    DE.strip.draw($('strip'), o);
  }

  // ---- map ----
  function setMarker(which) {
    var p = state[which];
    if (markers[which]) { markers[which].remove(); markers[which] = null; }
    if (!map || !p || (which === 'work' && state.remote)) return;
    markers[which] = new maplibregl.Marker({ color: which === 'home' ? '#2a7' : '#c33' })
      .setLngLat([p.lon, p.lat]).addTo(map);
  }

  function setRouteLine(coords) {
    if (!map || !map.getSource('route')) return;
    map.getSource('route').setData({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords || [] }
    });
  }

  function fitPins() {
    if (!map) return;
    var b = new maplibregl.LngLatBounds();
    b.extend([state.home.lon, state.home.lat]);
    if (!state.remote) b.extend([state.work.lon, state.work.lat]);
    map.fitBounds(b, { padding: 60, maxZoom: 13 });
  }

  function initMap() {
    map = new maplibregl.Map({
      container: 'map',
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [0, 20],
      zoom: 0.8
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
    map.on('style.load', function () {
      map.setProjection({ type: 'globe' });
      map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } } });
      map.addLayer({
        id: 'route', type: 'line', source: 'route',
        paint: { 'line-color': '#1b66d1', 'line-width': 5 },
        layout: { 'line-cap': 'round', 'line-join': 'round' }
      });
      setMarker('home');
      setMarker('work');
      if (lastRoute) setRouteLine(lastRoute);
    });
    map.once('load', function () {
      // Earth first, then Ireland.
      setTimeout(function () {
        map.flyTo({ center: [-7.6, 53.2], zoom: 5.5, duration: 2500 });
        map.once('moveend', fitPins);
      }, 600);
    });
    map.on('click', function (e) {
      var which = document.querySelector('input[name="pin"]:checked').value;
      setPlace(which, { lat: e.lngLat.lat, lon: e.lngLat.lng, label: e.lngLat.lat.toFixed(4) + ', ' + e.lngLat.lng.toFixed(4) });
    });
  }

  // ---- places ----
  var lastRoute = null;
  function setPlace(which, p) {
    state[which] = p;
    $('q-' + which).value = p.label;
    $('r-' + which).innerHTML = '';
    if (which === 'work') { state.remote = false; $('remote').checked = false; }
    setMarker(which);
    updateRemoteUi();
    fitPins();
    refreshRoute();
    recompute();
  }

  function wireSearch(which) {
    var input = $('q-' + which), list = $('r-' + which), timer, seq = 0;
    input.addEventListener('input', function () {
      clearTimeout(timer);
      var q = input.value.trim();
      if (q.length < 3) { list.innerHTML = ''; return; }
      timer = setTimeout(function () {
        var mine = ++seq;
        DE.route.search(q).then(function (items) {
          if (mine !== seq) return;
          list.innerHTML = '';
          items.forEach(function (it) {
            var li = document.createElement('li'), b = document.createElement('button');
            b.type = 'button';
            b.textContent = it.label;
            b.addEventListener('click', function () { setPlace(which, it); });
            li.appendChild(b);
            list.appendChild(li);
          });
        });
      }, 350);
    });
  }

  // ---- routing ----
  function refreshRoute() {
    var seq = ++routeSeq;
    lastRoute = null;
    setRouteLine(null);
    if (state.remote) return;
    DE.route.route(state.home, state.work, state.mode).then(function (r) {
      if (seq !== routeSeq || !r) return; // failure: slider only, silently
      lastRoute = r.coords;
      setRouteLine(r.coords);
      state.commute = Math.min(120, r.minutes);
      $('commute').value = state.commute;
      $('commute-out').textContent = state.commute;
      recompute();
    });
  }

  function updateRemoteUi() {
    $('commute').disabled = state.remote;
    $('mode').disabled = state.remote;
    $('q-work').disabled = state.remote;
    setMarker('work');
  }

  // ---- events ----
  function wire() {
    wireSearch('home');
    wireSearch('work');
    $('remote').addEventListener('change', function () {
      state.remote = this.checked;
      updateRemoteUi();
      fitPins();
      refreshRoute();
      recompute();
    });
    $('mode').addEventListener('change', function () { state.mode = this.value; refreshRoute(); });
    $('commute').addEventListener('input', function () {
      state.commute = +this.value;
      $('commute-out').textContent = state.commute;
      recompute();
    });
    $('start').addEventListener('change', recompute);
    $('finish').addEventListener('change', recompute);
    Array.prototype.forEach.call(document.querySelectorAll('input[name="regime"]'), function (el) {
      el.addEventListener('change', function () { state.regime = this.value; recompute(); });
    });
    // Width-only: Safari's address bar changes height and must not rebuild.
    window.addEventListener('resize', function () {
      if ($('strip').clientWidth !== lastStripWidth) recompute();
    });
  }

  $('q-home').value = state.home.label;
  $('q-work').value = state.work.label;
  $('commute-out').textContent = state.commute;
  wire();
  initMap();
  recompute();
  refreshRoute();
})();
