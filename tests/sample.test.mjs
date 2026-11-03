// Integration test against a real JP Group report. The PDF is client data and is never committed:
//   FH_SAMPLE_PDF=/path/to/report.pdf npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractReport } from '../js/extract.js';
import { buildModel } from '../js/model.js';

const file = process.env.FH_SAMPLE_PDF;

test('sample report extracts consistently', { skip: !file && 'set FH_SAMPLE_PDF to run' }, async () => {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), verbosity: 0 }).promise;
  const m = buildModel(await extractReport(doc, pdfjs.OPS));
  const errors = m.checks.filter(c => c.level === 'error' && !c.text.startsWith('חסר סיווג נזילות'));
  assert.deepEqual(errors, [], 'no consistency errors');
  assert.ok(m.managers.length > 0);
  assert.ok(m.meta.reportDate.match(/^\d{2}\/\d{2}\/\d{4}$/));
  const withRet = m.managers.filter(x => x.r12 != null);
  assert.ok(withRet.every(x => x.std != null), 'std extracted for every manager with a return');
  for (const s of m.stdInfo) assert.equal(s.markers, s.managers, `chart markers = managers on page ${s.page}`);
});
