# CLAUDE.md — dark-evenings

Standing instructions for Claude Code. Read this at the start of every session.

## What this is
A personal, funny data story about the clocks changing: "I hate leaving work in the dark, so I worked out what it costs me, and whether scrapping the clock change would save me." Story-led, Ireland first, ending in a personal tool (your town + your leaving time → your dark evenings, under three clock regimes) and a shareable "receipt".

- **Live URL:** https://ciaranbrennan.ie/dark-evenings/ (GitHub Pages from `main` / `/docs`; the domain comes from the portfolio repo)
- **Concept, story and design docs:** `design/` (gitignored, local only). Start with `design/concept.md`.
- **Target:** ship by mid-February 2027, ahead of the clocks going forward on 28 Mar 2027.

## Division of labour
The author owns product, story and every word of prose. Planning and prompts come from a separate claude.ai project. **Claude Code implements.** Don't write or rewrite user-facing prose beyond placeholders marked `TODO`.

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
- **Plain HTML, CSS and JS. No frameworks, no build step, no npm runtime dependencies.**
- **No CDN loads**, except the self-hosted Umami at `analytics.ciaranbrennan.ie`.
- Canvas or inline SVG for graphics. No chart libraries.
- Sun maths is computed in the browser (SunCalc-equivalent; vendor it or write it, don't hotlink). Clock rules come from `Intl` (IANA tzdb).
- System fonts unless the design docs say otherwise.

## Data rules
- Scripts that produce numbers live in `exploration/` (Python, stdlib preferred) and are committed and reproducible.
- Published data lives in `docs/data/`. Every file records its source, licence and generation date.
- Credits: GeoNames (CC BY 4.0); Tailte Éireann (CC BY 4.0); OSNI (UK OGL); OSM (ODbL) if used.

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