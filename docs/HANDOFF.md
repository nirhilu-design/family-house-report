# HANDOFF – Family House summary report

Approved by Nir (Zviran) in Oct–Nov 2026. Source of the design: the "Design" canvas artifact (pages "עמוד 1 – סקירת תיק" and "עמוד 2 – תשואות וסיכון"). This repo reproduces that design from data.

## 1. What the tool does
Input: JP Group periodic report PDF ("פירוט תיק ההשקעות לתאריך …", landscape, ~16 pages).
Output: 2 × A4 portrait summary for Family House clients (Hebrew RTL), exported via the browser's print-to-PDF.
Flow: upload → automatic extraction → consistency checks → mapping review & edits → live preview → export (PDF) / save (JSON).

## 2. Design system (do not change without approval)

### Principles
- Old-money private-bank statement: restraint, one right-aligned axis, numbers carry the page.
- Total value is prominent by position, not size (32px, right-aligned in the summary band). A big centred number was rejected.
- Every length/area in a chart equals a share of the portfolio. No decorative/arbitrary bars. No additional chart types.
- **Single typeface:** Calibri everywhere (`Calibri, Carlito, Assistant, 'Segoe UI', Arial, sans-serif`). Serif was tried and rejected.

### Colour standard
| Rule | Colours |
|---|---|
| Any distribution: darker = larger share | ramp `#2E2F31 → #B08D35 → #F2E8C9` (`ramp()` in `js/config.js`); 4-class allocation uses `#2E2F31 #8B7234 #C3A75F #E2D2A6` |
| Two-group donuts (currency, geography) | larger group `#2E2F31`, smaller `#B08D35` |
| Liquidity (semantic, overrides the size rule) | locked > 1 year `#2E2F31` · up to 1 year `#B08D35` · up to 1 month `#CFCFD1` |
| Text | ink `#2A2B2D`, muted `#5E6064`, gold text `#8A6A1C`, negative returns `#9B3B2B` |
| Surfaces | top rule 3px `#B08D35`; donut panel `#FAFAF9` (lighter than the liquidity grey); table totals `#F2F2F2` |

A colour key line under the donuts states both rules.

### Page 1 – סקירת תיק
1. Header: "לקוח:" + client name (26px) + "דוח ריכוז השקעות ומנהלים"; logo with swoosh on the left.
2. Summary band between two gold hairlines: total value (32px) + "נכון ליום"; then 4 KPIs: ILS 12M return, USD 12M return, FX exposure % (+ ₪M), number of managers.
3. Asset allocation: one 28px stacked bar (sorted desc, dark→light) + legend.
4. Panel with three donuts: currency, geography, liquidity ("[סיווג לאישור]" until all liquidity choices are confirmed) + colour key.
5. Manager exposure: one full-width 34px bar of all managers (sorted desc, ramp colours) + holdings table in two columns: swatch · **number** · name · weight · value ₪, total row.

### Page 2 – תשואות וסיכון
1. Header: title, subtitle, client | date, round logo.
2. Two returns tables (ILS / USD) side by side: manager · weight · 12M · 24M (cumulative), sorted by 12M desc, totals from the PDF. Neutral header colours (gold is reserved for "up to 1 year").
3. Manager notes box (under the USD table) with signature line.
4. Risk/return bubble chart: x = std-dev (%), y = 12M return; bubble area ∝ weight; **colour = liquidity**; **number inside = the manager's number from the page 1 table**; legend in 4 columns below (advisory portfolio shown as "(ללא תשואה)").
5. Footer: original PDF disclaimer (+ "בתודה, JP Group"), confidential line, page number.

## 3. Data mapping – source PDF → report
Sections are located by **title text**, not page numbers (`TITLES` in `js/extract.js`).

| Report field | PDF section (title) | Row / column | Notes |
|---|---|---|---|
| Report date | page header "דו"ח תקופתי dd/mm/yyyy" | — | |
| Source production date | footer "מועד הפקת הדוח" | — | shown in the mapping panel only |
| Total value | התפלגות לפי מנהלי השקעות | row סה"כ, col שווי בש"ח | cross-checked with channels/assets/exposures |
| Channels | סה"כ תיק השקעות | rows מיועץ / ניהול תיקים / קרנות גידור ואלטרנטיב | used to validate manager→channel |
| Asset allocation | סה"כ תיק השקעות לפי אפיקים | 4 rows (value, %) | |
| Managers (weights) | התפלגות לפי מנהלי השקעות | all rows (value, %) | sorted desc → numbers 1..N |
| Manager channel | מבנה תיק מנוהל – ניהול תיקים (header names) | — | in that header → pm; name starts with "מיועץ" → advisory; else alternative |
| Geography | חשיפה גאוגרפית – תיק השקעות כולל | groups (% of total) + children (% of group) | group/child split by running remainder |
| Currency | חשיפה למטבעות – תיק השקעות כולל | same as geography | FX KPI = non-ILS group |
| ILS returns | תשואות השקעות בש"ח | cols מתחילת שנה / 12 חודשים / 24 חודשים, row סה"כ | YTD not displayed |
| USD returns | תשואות השקעות במט"ח | same | |
| Std-dev | "גרף מדדי יעילות התיק ל-12 חודשים" under each returns table | vector markers (small filled circles) | axes fitted from tick labels; markers matched to managers by rank of 12M return |
| Disclaimer | text starting "חשוב לציין" | until "בתודה / JP Group" | |
| Liquidity | **not in PDF** | — | provisional defaults in `js/config.js`; user confirms; remembered per manager name in localStorage |
| Client name, notes, signer | **not in PDF** | — | manual |

Not used: asset-class detail (מבנה תיק השקעות כולל), per-manager structure/geography/currency pages, monthly returns.

## 4. Consistency checks (`runChecks`)
Managers sum = total; weights sum ≈ 100%; asset classes, geography and currency sum to total; manager channel sums match the channels table; returns tables found; std-dev extracted for every manager with a return; liquidity set for all managers (warning while still default); client name present; > 16 managers warns about page-1 overflow.

## 5. Open items
- Liquidity classification is provisional until confirmed per manager.
- Possible additions discussed but not approved: opening value / net flows / ₪ P&L, benchmarks per currency bucket, branding decision (JP Group vs Family House).
