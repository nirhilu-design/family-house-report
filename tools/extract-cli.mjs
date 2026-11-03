// Usage: node tools/extract-cli.mjs <report.pdf> [--model]
// Prints the raw extraction (or the built report model with --model) as JSON.
import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractReport } from '../js/extract.js';
import { buildModel } from '../js/model.js';

const file = process.argv[2];
if (!file) { console.error('usage: node tools/extract-cli.mjs <report.pdf> [--model]'); process.exit(1); }
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), verbosity: 0 }).promise;
const raw = await extractReport(doc, pdfjs.OPS);
const out = process.argv.includes('--model') ? buildModel(raw) : raw;
console.log(JSON.stringify(out, null, 2));
