# CLAUDE.md — dark-evenings

Standing instructions for Claude Code. Read this at the start of every session.

## What this is
A simple, single-page tool: **how much of your commute happens in the dark?**

- **Inputs:** home and work (Photon search or tap the map; a "Remote" switch skips work and commute), start and finish times (weekdays), commute mode (car/bike/walk) → time from Valhalla, shown on a slider that can override it (slider only if routing fails).
- **Calculation:** each weekday for the next 12 months; morning trip = start − commute → start, evening trip = finish → finish + commute; NOAA sun maths at home; "dark" = sun more than 6° below the horizon at any point of the trip. Toggle: current clocks / permanent summer time.
- **Output:** two big numbers (dark mornings, dark evenings); a year strip with the commute windows marked dark/twilight/light; a globe that flies to the route.
- **Defaults:** Entry starts empty (Home/Work placeholders). "See demo" fills Cork → Cork city centre, 09:00–17:30, car, and runs it.
- **Privacy:** one line saying home and work go to Photon and Valhalla, nothing is stored, and pick a spot near home.
- **Not in v1:** scroll story, receipt, accounts, saved state, public transport, multiple commutes. **Keep it small.**
- **Live URL:** https://ciaranbrennan.ie/dark-evenings/ (GitHub Pages from `main` / `/docs`). **Target:** mid-February 2027.

## Division of labour
The author owns product, design decisions and every word of copy. Planning and prompts come from a separate claude.ai project. **Claude Code implements.** Don't write or rewrite user-facing prose beyond placeholders marked `TODO`.

## Process rules
1. **Reflect first.** Before any edit: restate the task, list every file and function you'll change, and flag risks or ambiguities. Then **stop and wait for approval.**
2. **Never commit or push.** The author commits.
3. **One sub-stage per session.** Stay in scope; note anything else you find and don't fix it unasked.
4. **Measure, don't assume.** Verify claims (sizes, timings, counts) and report the actual numbers.

## Design rules
- **Portrait first.** Design at 390 × 700 (a real Safari viewport, not 844), then let it grow to desktop. Test at 375×667, 390×664, 390×750 and 1440×900.
- **A real phone is the gate.** Screenshots aren't sign-off.
- Text sits **on** the graphic, not in boxed cards over a canvas.
- Animation only where a transition explains something. Respect `prefers-reduced-motion`.
- On-canvas text ≥ 14 px; tap targets ≥ 44 px.
- Height-only resizes (Safari's address bar) must **not** trigger rebuilds.

## Stack rules
- **Simple browser site: plain HTML, CSS and JS. No frameworks, no build step.**
- **CDN libraries are allowed if version-pinned** (exact version + integrity hash), e.g. MapLibre GL JS for the globe/map.
- **External services, called directly from the browser:** OpenFreeMap (map tiles), Photon (place search), Valhalla on the FOSSGIS server (commute routing). If routing fails or is throttled, fall back to the commute slider. Never let a failed service break the page.
- Self-hosted Umami at `analytics.ciaranbrennan.ie`.
- Sun maths computed in the browser using the **NOAA solar calculator method** (iterated at event time; matches sunrise-sunset.org to the second). Not SunCalc (about 3 min error at sunset). Clock rules come from `Intl` (IANA tzdb).
- Inter (OFL), self-hosted in docs/fonts/. No font CDNs.

## Data rules
- Scripts that produce numbers live in `exploration/` (Python, stdlib preferred) and are committed and reproducible.
- Published data lives in `docs/data/`. Every file records its source, licence and generation date.
- Credits: map data © OpenStreetMap contributors (ODbL), tiles by OpenFreeMap; search by Photon (komoot, OSM data); routing by Valhalla (FOSSGIS server, OSM data). Show these in the map attribution and the page footer.

## Repo layout
```
docs/          published site (index.html, css/, js/, data/)
exploration/   reproducible data/number scripts
design/        gitignored: concept, stills, prototypes, reflections, sources
CLAUDE.md      this file
README.md
```

## Launch rules (portfolio standard): do these only at launch
- Remove `<meta name="robots" content="noindex">` (it's there from day one on purpose)
- Canonical = `og:url` = `https://ciaranbrennan.ie/dark-evenings/` (trailing slash)
- `og:image` share card; noscript summary + JSON-LD for non-JS crawlers
- Umami: `<script defer src="https://analytics.ciaranbrennan.ie/script.js" data-website-id="b8992f59-bcb2-4f10-a02a-2ffa23f482e0" data-domains="ciaranbrennan.ie,www.ciaranbrennan.ie" data-tag="dark-evenings" data-do-not-track="true"></script>`. Event names snake_case, `object_action`.
- Portfolio repo: a sitemap entry with `lastmod`, plus a static entry in `projects-menu.html` with `data-umami-event="project_clicked" data-umami-event-project="dark-evenings"`