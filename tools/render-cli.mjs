// Usage: node tools/render-cli.mjs <report.pdf> <out.html> [model-overrides.json]
// Extracts, builds the model and writes a standalone HTML preview of the two pages (for tests / CI).
import fs from 'node:fs';
import path from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractReport } from '../js/extract.js';
import { buildModel } from '../js/model.js';
import { renderReport } from '../js/render.js';

const [file, out, over] = process.argv.slice(2);
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), verbosity: 0 }).promise;
const model = buildModel(await extractReport(doc, pdfjs.OPS));
if (over) Object.assign(model.meta, JSON.parse(fs.readFileSync(over, 'utf8')).meta || {});
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<link rel="stylesheet" href="file://${root}/css/report.css">
<style>@page{size:794px 1123px;margin:0}body{margin:0}.fh-page{break-after:page}.fh-page:last-child{break-after:auto}</style></head>
<body>${renderReport(model, { logoFull: `file://${root}/assets/logo-full.png`, logoCircle: `file://${root}/assets/logo-circle.png` })}</body></html>`;
fs.writeFileSync(out, html);
console.log('wrote', out, 'checks:', model.checks.filter(c => c.level !== 'ok').map(c => c.text).join(' | '));
