// Wiring: hook, entry, lazy libraries, map, inputs, routing, counts, strip.
(function () {
  var DE = window.DE;
  var $ = function (id) { return document.getElementById(id); };
  var ORANGE = '#ff8c1a', MAP_BG = '#1c1c1c';

  // Lazy-loaded, version-pinned CDN files (exact version + integrity hash).
  var LIBS = {
    mapJs: { url: 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.js', sri: 'sha384-5+cfbwT0iiub6VsQAdn6yz16nr6sDiQoHx6tm4O8OVYXHYOxcffFmCJBL0dgdvGp' },
    mapCss: { url: 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.css', sri: 'sha384-uTttxo/aOKbdE5RlD/SPzSDoDmNvGlUYPjONi2MN/b7c9HPSvW07OIuyP7uL6jxK' },
    tz: { url: 'https://cdn.jsdelivr.net/npm/tz-lookup@6.1.25/tz.js', sri: 'sha384-hu4xDymJTssX8+i8qDUKexc5lIusgVeLPv72brg57d+WMdeCGtr3A1U8oW8PEtaP' }
  };

  // "See demo" fills these.
  var DEMO_HOME = { lat: 51.8775545, lon: -8.4358941, label: 'Douglas, Cork' };
  var DEMO_WORK = { lat: 51.897968, lon: -8.47061, label: 'Patrick Street, Cork' };

  var state = {
    home: null,
    work: null,
    remote: false,
    mode: 'car',
    commute: 20,
    regime: 'current'
  };
  var routeSeq = 0;
  var routePending = Promise.resolve(); // the latest route request, settled either way
  var map = null;
  var lastRoute = null;
  var ready = false;      // result revealed and tz-lookup loaded: live recompute is on
  var libs = null;        // {tz: Promise, map: Promise}, created on first Find out

  function reduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function hhmm(s) { var p = s.split(':'); return (+p[0]) * 60 + (+p[1]); }
  function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function window12() {
    var a = new Date(), b = new Date(a.getFullYear() + 1, a.getMonth(), a.getDate() - 1);
    return { from: iso(a), to: iso(b) };
  }

  // ---- lazy loading ----
  function loadScript(def) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = def.url; s.integrity = def.sri; s.crossOrigin = 'anonymous';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  function loadStyle(def) {
    return new Promise(function (resolve) {
      var l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = def.url; l.integrity = def.sri; l.crossOrigin = 'anonymous';
      l.onload = resolve; l.onerror = resolve; // a missing stylesheet must not block anything
      document.head.appendChild(l);
    });
  }
  function ensureLibs() {
    if (!libs) {
      libs = {
        tz: loadScript(LIBS.tz).catch(function () { /* falls back to the browser's zone */ }),
        map: Promise.all([loadStyle(LIBS.mapCss), loadScript(LIBS.mapJs)]).then(function () { return true; }, function () { return false; })
      };
    }
    return libs;
  }

  function homeTz() {
    try { if (typeof tzlookup === 'function') return tzlookup(state.home.lat, state.home.lon); } catch (e) { /* fall through */ }
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  }

  // ---- counts + strip ----
  function inputs() {
    var w = window12();
    return {
      lat: state.home.lat, lon: state.home.lon, tz: homeTz(),
      startMin: hhmm($('start').value || '09:00'),
      finishMin: hhmm($('finish').value || '17:30'),
      commuteMin: state.remote ? 0 : state.commute,
      from: w.from, to: w.to
    };
  }

  var lastStripWidth = 0;
  function recompute() {
    if (!ready || !state.home) return; // before Find out (or home unset) nothing is recomputed
    lastStripWidth = $('strip').clientWidth;
    DE.strip.update(inputs(), state.regime);
    var c = DE.strip.counts(state.regime);
    $('n-morning').textContent = c.mornings;
    $('n-evening').textContent = c.evenings;
  }

  // ---- map ----
  function pinsData() {
    var f = [];
    if (state.home) f.push({ type: 'Feature', properties: { kind: 'home' }, geometry: { type: 'Point', coordinates: [state.home.lon, state.home.lat] } });
    if (state.work && !state.remote) f.push({ type: 'Feature', properties: { kind: 'work' }, geometry: { type: 'Point', coordinates: [state.work.lon, state.work.lat] } });
    return { type: 'FeatureCollection', features: f };
  }
  function setPins() {
    if (map && map.getSource('pins')) map.getSource('pins').setData(pinsData());
  }

  function setRouteLine(coords) {
    if (!map || !map.getSource('route')) return;
    map.getSource('route').setData({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords || [] }
    });
  }

  function fitPins() {
    if (!map || !state.home) return;
    var b = new maplibregl.LngLatBounds();
    b.extend([state.home.lon, state.home.lat]);
    if (state.work && !state.remote) b.extend([state.work.lon, state.work.lat]);
    // Leave room for the title (top) and the numbers (bottom).
    map.fitBounds(b, { padding: { top: 70, bottom: 150, left: 50, right: 50 }, maxZoom: 13, duration: reduced() ? 0 : 2500 });
  }

  function initMap() {
    if (map || typeof maplibregl === 'undefined') return;
    map = new maplibregl.Map({
      container: 'map',
      style: 'https://tiles.openfreemap.org/styles/dark',
      center: [-7.6, 53.2], // starts on Ireland, then flies to the route
      zoom: 5.5,
      attributionControl: { compact: true }
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
    map.on('style.load', function () {
      map.setProjection({ type: 'globe' });
      try { map.setPaintProperty('background', 'background-color', MAP_BG); } catch (e) { /* style without background */ }
      // Quieten the labels so the route and pins read first.
      map.getStyle().layers.forEach(function (l) {
        if (l.type === 'symbol') map.setPaintProperty(l.id, 'text-opacity', 0.55);
      });
      map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } } });
      map.addLayer({
        id: 'route', type: 'line', source: 'route',
        paint: { 'line-color': ORANGE, 'line-width': 4 },
        layout: { 'line-cap': 'round', 'line-join': 'round' }
      });
      // Added last, so pins draw above every label layer.
      map.addSource('pins', { type: 'geojson', data: pinsData() });
      map.addLayer({
        id: 'pin-home', type: 'circle', source: 'pins', filter: ['==', ['get', 'kind'], 'home'],
        paint: { 'circle-radius': 7, 'circle-color': ORANGE, 'circle-stroke-color': MAP_BG, 'circle-stroke-width': 2 }
      });
      map.addLayer({
        id: 'pin-work', type: 'circle', source: 'pins', filter: ['==', ['get', 'kind'], 'work'],
        paint: { 'circle-radius': 7, 'circle-color': MAP_BG, 'circle-stroke-color': ORANGE, 'circle-stroke-width': 3 }
      });
      if (lastRoute) setRouteLine(lastRoute);
    });
    map.once('load', function () {
      var attrib = map.getContainer().querySelector('.maplibregl-ctrl-attrib');
      if (attrib) { attrib.classList.remove('maplibregl-compact-show'); attrib.removeAttribute('open'); }
      fitPins();
    });
    map.on('click', function (e) {
      var which = document.querySelector('input[name="pin"]:checked').value;
      setPlace(which, { lat: e.lngLat.lat, lon: e.lngLat.lng, label: e.lngLat.lat.toFixed(4) + ', ' + e.lngLat.lng.toFixed(4) });
    });
    $('pin-row').hidden = false;
  }

  // ---- places ----
  function canFind() {
    return !!state.home && (state.remote || !!state.work);
  }
  function updateFind() { $('find').disabled = !canFind(); }

  function setPlace(which, p) {
    state[which] = p;
    $('q-' + which).value = p.label;
    $('r-' + which).innerHTML = '';
    if (which === 'work') { state.remote = false; $('remote').checked = false; }
    updateRemoteUi();
    updateFind();
    fitPins();
    refreshRoute();
    recompute();
  }

  function wireSearch(which) {
    var input = $('q-' + which), list = $('r-' + which), timer, seq = 0;
    input.addEventListener('input', function () {
      // Editing the text un-sets the place until a suggestion is chosen.
      state[which] = null;
      updateFind();
      setPins();
      if (which === 'home') { /* keep last result on screen */ }
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
    if (state.remote || !state.home || !state.work) { routePending = Promise.resolve(); return; }
    routePending = DE.route.route(state.home, state.work, state.mode).then(function (r) {
      if (seq !== routeSeq) return;
      $('commute-wrap').hidden = false; // routed or not, the slider is now usable
      if (!r) return; // failure: slider only, silently
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
    Array.prototype.forEach.call(document.querySelectorAll('input[name="mode"]'), function (el) { el.disabled = state.remote; });
    $('q-work').disabled = state.remote;
    setPins();
  }

  // ---- flow ----
  function scrollTo(el) {
    el.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
  }

  function findOut() {
    if (!canFind()) return;
    var L = ensureLibs();
    var result = $('result');
    var first = result.hidden;
    if (first) {
      result.hidden = false;
      $('mount-result').appendChild($('inputs')); // one inputs block, now under the strip
      $('find').textContent = 'TODO back to result';
      $('demo').hidden = true;
    }
    scrollTo(result);
    // Wait for the route too, so the first numbers use the real commute.
    Promise.all([L.tz, routePending]).then(function () {
      ready = true;
      recompute();
    });
    L.map.then(function (ok) { if (ok) initMap(); });
  }

  function fillDemo() {
    state.home = DEMO_HOME; state.work = DEMO_WORK; state.remote = false;
    $('q-home').value = DEMO_HOME.label;
    $('q-work').value = DEMO_WORK.label;
    $('r-home').innerHTML = ''; $('r-work').innerHTML = '';
    $('remote').checked = false;
    updateRemoteUi();
    updateFind();
    refreshRoute();
    findOut();
  }

  // ---- events ----
  function wire() {
    wireSearch('home');
    wireSearch('work');
    $('remote').addEventListener('change', function () {
      state.remote = this.checked;
      updateRemoteUi();
      updateFind();
      fitPins();
      refreshRoute();
      recompute();
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="mode"]'), function (el) {
      el.addEventListener('change', function () { state.mode = this.value; refreshRoute(); });
    });
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
    $('hook-go').addEventListener('click', function () { scrollTo($('entry')); });
    $('find').addEventListener('click', findOut);
    $('demo').addEventListener('click', fillDemo);
    $('hook-replay').addEventListener('click', function () { DE.hook.replay(); });

    // Redraw only when a canvas box really changes size. Safari's address bar
    // changes the viewport height, but the hook is sized in svh, so neither it
    // nor the strip changes size and nothing rebuilds.
    var lastHook = DE.hook.size();
    window.addEventListener('resize', function () {
      var h = DE.hook.size();
      if (h !== lastHook) { lastHook = h; DE.hook.redraw(); }
      var w = $('strip').clientWidth;
      if (w && w !== lastStripWidth) { lastStripWidth = w; DE.strip.redraw(); }
    });
    // Canvas text needs Inter; redraw once it has loaded.
    if (document.fonts && document.fonts.load) {
      Promise.all([document.fonts.load('500 14px Inter'), document.fonts.load('400 14px Inter')])
        .then(function () { DE.strip.redraw(); }, function () { /* system font stays */ });
    }
  }

  $('commute-out').textContent = state.commute;
  DE.strip.init($('strip'));
  DE.hook.init($('hook-canvas'));
  wire();
  updateFind();
  refreshRoute();
})();
