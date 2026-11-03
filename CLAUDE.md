# CLAUDE.md – family-house-report

Client-side generator for the 2-page Family House summary report from the JP Group periodic report PDF. Hebrew RTL. Read `docs/HANDOFF.md` before changing design or data mapping.

## Hard rules
- **Never commit client data**: no PDFs, no exported JSON, no real client names in code, tests or fixtures. Tests use synthetic data; the real-PDF test reads `FH_SAMPLE_PDF` from env.
- **Stay client-side and deterministic**: no backend, no network calls at runtime, no AI in the extraction path. pdf.js and fonts are vendored (`npm run vendor`).
- **Design is approved** (see `docs/HANDOFF.md` §2). Keep: Calibri stack everywhere, colour standard (darker = larger share; liquidity: dark = locked >1y, gold = ≤1y, light grey = ≤1m), numbered managers shared between page 1 table and page 2 bubbles, original PDF disclaimer at the bottom of page 2. Do not add new chart types.
- Pages are fixed 794×1123px. After any layout change, render the sample and check nothing overflows (footer must not overlap content).

## Commands
- `npm test` – unit tests; `FH_SAMPLE_PDF=… npm test` – plus integration test.
- `node tools/extract-cli.mjs <pdf> --model` – print the report model as JSON.
- `node tools/render-cli.mjs <pdf> <out.html>` – standalone preview (open in Chromium / print to PDF).
- `python -m http.server 8080` – run the app.

## Code map
- `js/extract.js` – rows from pdf.js text items (RTL: items sorted by x desc), sections found by title text (`TITLES`), chart debris filtered by distance from the table's right edge, std-dev from vector markers in the efficiency charts (`extractScatter` + rank matching in `matchMarkers`).
- `js/model.js` – `buildModel(raw, savedOverrides)` and `runChecks(model)`. Rounding via `round()` (avoid raw `toFixed`).
- `js/render.js` – `renderPage1/renderPage2` produce HTML strings with classes from `css/report.css`.
- `js/config.js` – liquidity defaults (provisional!), channel labels, colour ramp, fallback disclaimer.
