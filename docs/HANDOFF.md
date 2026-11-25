# HANDOFF – Family House summary report

Approved by Nir (Zviran) in Oct–Nov 2026. Source of the design: the "Design" canvas artifact (pages "עמוד 1 – סקירת תיק" and "עמוד 2 – תשואות וסיכון"). This repo reproduces that design from data.

## 1. What the tool does
Input: JP Group periodic report PDF ("פירוט תיק ההשקעות לתאריך …", landscape, ~16 pages).
Output: 2 × A4 portrait summary for Family House clients (Hebrew RTL), exported via the browser's print-to-PDF.
Flow: upload → automatic extraction → consistency checks → mapping review & edits → live preview → export (PDF) / save (JSON).

## 2. Design system (do not change without approval)

### Principles
- Old-money private-bank statement: restraint, one right-aligned axis, numbers carry the page.
- Total value leads page 1 in the hero: 34px regular weight with a small grey ₪, behind a 3px gold rule, right-aligned. A big centred or bold number was rejected (restraint reads as private banking).
- Every length/area in a chart equals a share of the portfolio. No decorative/arbitrary bars. No additional chart types.
- **All percentages everywhere: one decimal** (bar labels, donut centres and legends, managers table, returns tables). Bar widths keep full precision.
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

### Page 1 – סקירת תיק (version B, on `main`; version A kept on branch `version-a`)
Sections in reading order (general → specific), separated by 18px and a uniform section head (19px title, small grey subtitle, 1px ink rule):
1. Header: "לקוח:" + client name (26px) + "דוח ריכוז השקעות ומנהלים"; logo with swoosh on the left.
2. Hero: "שווי התיק המנוהל" (gold caps) · total value · "נכון ליום dd.mm.yyyy · N מנהלי השקעות"; next to it, after a hairline, a fixed intro sentence inviting the client to read the page (allocation, managers, returns incl. risk/return).
3. "פיזור התיק" (subtitle = colour key "darker = larger"): panel `#FAFAF9` with four 72px donuts in one row, legend under each: investment channel ("סה"כ תיק השקעות" in the PDF – titled "לפי ערוץ השקעה", centre = largest, "אלטרנטיב"), currency, geography, asset allocation. No separate key line.
4. "התפלגות מנהלי השקעות": 20px graded bar + numbered holdings table (swatch · number · name · weight · value ₪). **Up to 8 managers → one column**, otherwise two. Total row "סה״כ תיק 100%" + total at normal size (the headline number is in the hero).
5. "תשואות לפי מנהל": two tables (ILS / USD) side by side: **manager number** + name · value · "מתחילת שנה" (two-line header) · 12M · 24M (cumulative), one decimal, names on one line. Sorted by 12M desc, totals from the PDF. **Both tables always the same height** (blank padding rows). **USD table in dollars** when the month-end rate is entered on the upload page: value ÷ rate, header "שווי $", note "(לפי שער יציג X)"; without a rate it shows ₪ with "(סכומים מצוינים בשקלים)" and a check warns.

### Page 2 – תשואות וסיכון
1. Header: title, subtitle, client | date, round logo.
2. Risk/return bubble chart, full width 682×290: x = std-dev (%), y = 12M return; bubble area ∝ weight; **colour = liquidity**; **number inside = the manager's number from page 1**; numbered legend in 4 columns below (advisory portfolio "(ללא תשואה)"). No key line next to the title (removed on request).
3. Manager notes box with signature line.
4. Footer: original PDF disclaimer (+ "בתודה, JP Group"), confidential line, page number.

**Automatic layout** (`chooseLayout()` in `js/render.js`, deterministic from row counts, ~22.7px per row): returns tables stay on page 1 while holding rows (incl. total) + returns rows ≤ 17; otherwise they move to the top of page 2 (notes under the USD table, chart shortened to fit). The one-page layout for ≤ 6 managers is **off** (`ONE_PAGE_ENABLED`): with the version B page 1 it overflows by ~90px even with 6 managers. Option on the table: for ≤ 8 managers merge the holdings and returns tables into one, which frees room for a ~210–250px chart.

**Filling page 1** (`p1Fill()` in `js/render.js`): when page 1 ends well above the footer (typically ≤ 8 managers), the spare height is spread instead of leaving a white band: donuts grow first (72 → up to 108px), then the gaps between sections (18 → up to 48px, inner gaps a little), then table row padding. Same deterministic row-count estimate; the page ends ~10–25px above the footer for 3–15 managers. Implemented with CSS variables `--donut`, `--gap`, `--igap`, `--hpad`, `--rpad` on `.fh-page.p1`.

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
| Liquidity | **not in PDF** | — | shared liquidity table (Cloudflare KV, `admin.html`); provisional defaults in `js/config.js` until confirmed; a manager missing from both is flagged and its choice is saved to the table |
| Client name | page 1: the text line right above "פירוט תיק ההשקעות לתאריך …" (no digits, ≤ 60 chars), PDF order "surname first" flipped to first name first (last word moved to the front) | — | editable in the mapping panel |
| Investment channel donut | "סה"כ תיק השקעות" (page 2) | label · % | |
| Returns: YTD / 12M / 24M | "תשואות השקעות בש"ח" / "במט"ח" | the three % columns in order (YTD first); total row = "סה"כ" | YTD shown as "מתחילת שנה", editable in the mapping panel; check: in a December report YTD must equal 12M (guards the column order) |
| USD rate | **not in PDF** – month-end representative rate entered on the upload page | — | USD table value = ₪ ÷ rate |
| Notes, signer | **not in PDF** | — | manual |

Not used: asset-class detail (מבנה תיק השקעות כולל), per-manager structure/geography/currency pages, monthly returns.

## 4. Consistency checks (`runChecks`)
Managers sum = total; weights sum ≈ 100%; asset classes, geography and currency sum to total; manager channel sums match the channels table; returns tables found; std-dev extracted for every manager with a return; liquidity set for all managers (warning while still default); client name present; > 16 managers warns about page-1 overflow.

## 5. Open items
- Liquidity classification is provisional until confirmed per manager.
- Possible additions discussed but not approved: opening value / net flows / ₪ P&L, benchmarks per currency bucket, branding decision (JP Group vs Family House).
