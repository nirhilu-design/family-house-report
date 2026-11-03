// UI: upload → extract → review/map → preview → export. All in the browser.
import * as pdfjs from '../vendor/pdfjs/pdf.min.mjs';
import { extractReport } from './extract.js';
import { buildModel, runChecks, fmt } from './model.js';
import { renderReport } from './render.js';
import { LIQUIDITY, CHANNELS } from './config.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

const ASSETS = { logoFull: 'assets/logo-full.png', logoCircle: 'assets/logo-circle.png' };
const STORE = 'fh.managerOverrides.v1'; // liquidity/channel choices per manager name (no client data)
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let model = null;
let sourceName = '';

function loadOverrides() { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } }
function saveOverride(id, patch) {
  try { const o = loadOverrides(); o[id] = { ...(o[id] || {}), ...patch }; localStorage.setItem(STORE, JSON.stringify(o)); } catch { /* storage unavailable: choice stays for this session only */ }
}

function setStatus(text, err = false) { const s = $('#status'); s.textContent = text; s.classList.toggle('err', err); }

async function handlePdf(file) {
  if (!file) return;
  setStatus('קורא את הדוח…');
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
    const raw = await extractReport(doc, pdfjs.OPS);
    model = buildModel(raw, loadOverrides());
    sourceName = file.name;
    if (!model.managers.length) throw new Error('לא זוהתה טבלת מנהלי השקעות. ייתכן שזה לא דוח תקופתי של JP Group.');
    showWorkspace();
  } catch (e) {
    console.error(e);
    setStatus(`לא הצלחתי לקרוא את הקובץ: ${e.message || e}`, true);
  }
}

async function handleJson(file) {
  if (!file) return;
  try {
    const m = JSON.parse(await file.text());
    if (!m || m.version !== 1 || !Array.isArray(m.managers)) throw new Error('מבנה JSON לא מוכר');
    model = m; sourceName = file.name;
    showWorkspace();
  } catch (e) { setStatus(`קובץ JSON לא תקין: ${e.message}`, true); }
}

function showWorkspace() {
  $('#drop').hidden = true; $('#workspace').hidden = false;
  $('#save-json').disabled = false; $('#export-pdf').disabled = false;
  refresh(true);
}

function refresh(full = false) {
  model.checks = runChecks(model);
  if (full) renderMapping(); else renderChecks();
  renderPreview();
}

// ---------- mapping panel ----------
const src = p => (p ? `<span class="src">PDF עמ' ${p}</span>` : '<span class="src">ידני</span>');
const numInput = (path, v, d = 2, label = '') => `<input class="num${d === 0 ? ' big' : ''}" data-path="${path}" value="${v ?? ''}" inputmode="decimal" aria-label="${esc(label || path)}">`;

function renderChecks() {
  const el = $('#checks');
  if (el) el.innerHTML = model.checks.map(c => `<li class="${c.level}">${esc(c.text)}</li>`).join('');
}

function renderMapping() {
  const m = model;
  const liqOpts = v => `<option value="" ${!v ? 'selected' : ''}>— לבחירה —</option>` + Object.entries(LIQUIDITY).map(([k, o]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${o.label}</option>`).join('');
  const chOpts = v => Object.entries(CHANNELS).map(([k, o]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${o.short}</option>`).join('');
  const mgrRows = m.managers.map((x, i) => `<tr class="${x.liquiditySource === 'default' || !x.liquidity ? 'flag' : ''}">
      <td class="ro n">${x.n}</td>
      <td class="ro name">${esc(x.name)}</td>
      <td><select data-path="managers.${i}.liquidity" aria-label="נזילות ${esc(x.name)}">${liqOpts(x.liquidity)}</select></td>
      <td><select data-path="managers.${i}.channel" aria-label="ערוץ ${esc(x.name)}">${chOpts(x.channel)}</select></td>
      <td>${numInput(`managers.${i}.pct`, x.pct, 2, `משקל ${x.name}`)}</td>
      <td>${numInput(`managers.${i}.value`, x.value, 0, `שווי ${x.name}`)}</td>
      <td class="ro">${x.currency || '—'}</td>
      <td>${numInput(`managers.${i}.r12`, x.r12, 2, `תשואה 12 ח׳ ${x.name}`)}</td>
      <td>${numInput(`managers.${i}.r24`, x.r24, 2, `תשואה 24 ח׳ ${x.name}`)}</td>
      <td>${numInput(`managers.${i}.std`, x.std, 2, `סטיית תקן ${x.name}`)}</td>
    </tr>`).join('');
  const simple = (rows, cols) => `<div class="tbl-wrap"><table class="map"><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
  const acRows = m.assetClasses.map((a, i) => `<tr><td class="ro">${esc(a.label)}</td><td>${numInput(`assetClasses.${i}.value`, a.value, 0)}</td><td>${numInput(`assetClasses.${i}.pct`, a.pct)}</td></tr>`).join('');
  const grp = g => (g?.groups || []).map((x, i) => `<tr><td class="ro">${esc(x.label)}</td><td class="ro n">${fmt(x.value)}</td><td class="ro n">${x.pct}%</td><td class="ro">${x.children.map(c => esc(c.label)).join(', ')}</td></tr>`).join('');

  $('#mapping').innerHTML = `
    <h2>בדיקות תקינות <small>${esc(sourceName)}</small></h2>
    <ul class="checks" id="checks"></ul>

    <h2>פרטי הדוח <small>לא קיימים ב-PDF – הזנה ידנית</small></h2>
    <div class="grid2">
      <label class="field">שם הלקוח<input data-path="meta.clientName" value="${esc(m.meta.clientName)}" placeholder="מר ישראל ישראלי"></label>
      <label class="field">תאריך הדוח ${src(1)}<input data-path="meta.reportDate" value="${esc(m.meta.reportDate)}" class="n"></label>
      <label class="field">שם מנהל ההשקעות (חתימה)<input data-path="meta.signer" value="${esc(m.meta.signer)}"></label>
      <label class="field">מועד הפקת דוח המקור ${src(m.meta.pageCount)}<input value="${esc(m.meta.producedAt)}" readonly></label>
    </div>
    <label class="field" style="margin-top:10px">הערות מנהל ההשקעות (עמוד 2)<textarea data-path="meta.notes" placeholder="סקירת התקופה, הסבר לחריגות…">${esc(m.meta.notes)}</textarea></label>

    <h2>שורת הסיכום – עמוד 1</h2>
    <div class="tbl-wrap"><table class="map"><thead><tr><th>שדה בדוח</th><th>ערך</th><th>מקור</th></tr></thead><tbody>
      <tr><td>שווי תיק כולל (₪)</td><td>${numInput('total', m.total, 0)}</td><td>${src(m.managersPage)} התפלגות לפי מנהלי השקעות · סה"כ</td></tr>
      <tr><td>תשואה 12 ח׳ – אפיקים שקליים</td><td>${numInput('returns.ILS.total12', m.returns.ILS?.total12)}</td><td>${src(m.returns.ILS?.page)} תשואות השקעות בש"ח · סה"כ</td></tr>
      <tr><td>תשואה 24 ח׳ – אפיקים שקליים</td><td>${numInput('returns.ILS.total24', m.returns.ILS?.total24)}</td><td>${src(m.returns.ILS?.page)}</td></tr>
      <tr><td>תשואה 12 ח׳ – אפיקים דולריים</td><td>${numInput('returns.USD.total12', m.returns.USD?.total12)}</td><td>${src(m.returns.USD?.page)} תשואות השקעות במט"ח · סה"כ</td></tr>
      <tr><td>תשואה 24 ח׳ – אפיקים דולריים</td><td>${numInput('returns.USD.total24', m.returns.USD?.total24)}</td><td>${src(m.returns.USD?.page)}</td></tr>
      <tr><td>חשיפה למט״ח (%)</td><td>${numInput('fx.pct', m.fx?.pct)}</td><td>${src(m.fx?.page)} חשיפה למטבעות · מט"ח</td></tr>
      <tr><td>חשיפה למט״ח (₪)</td><td>${numInput('fx.value', m.fx?.value, 0)}</td><td>${src(m.fx?.page)}</td></tr>
    </tbody></table></div>

    <h2>מנהלי השקעות <small>${src(m.managersPage)} משקלים · תשואות מעמודי התשואות · סטיית תקן מגרפי היעילות</small></h2>
    <div class="tbl-wrap"><table class="map wide"><thead><tr><th>#</th><th>מנהל</th><th>נזילות</th><th>ערוץ</th><th>משקל %</th><th>שווי ₪</th><th>מטבע</th><th>12 ח׳ %</th><th>24 ח׳ %</th><th>סט״ת %</th></tr></thead><tbody>${mgrRows}</tbody></table></div>
    <p class="hint">שורות מסומנות = סיווג נזילות זמני (ברירת מחדל) או חסר. הנזילות לא מופיעה בדוח המקור; הבחירה נשמרת בדפדפן זה לפי שם המנהל ותופעל אוטומטית בדוחות הבאים. הערוץ נגזר מעמוד "מבנה תיק מנוהל – ניהול תיקים"${model.channelsPage ? ` ונבדק מול עמוד ${model.channelsPage}` : ''}.</p>
    <div class="row-actions"><button class="btn" id="confirm-liq">אישור כל סיווגי הנזילות כפי שהם</button></div>

    <h2>התפלגות לפי אפיק <small>${src(m.assetPage)}</small></h2>
    ${simple(acRows, ['אפיק', 'שווי ₪', 'אחוז'])}

    <h2>חשיפה מטבעית <small>${src(m.currency?.page)}</small></h2>
    ${simple(grp(m.currency), ['קבוצה', 'שווי ₪', 'אחוז מהתיק', 'פירוט'])}

    <h2>חשיפה גאוגרפית <small>${src(m.geo?.page)}</small></h2>
    ${simple(grp(m.geo), ['קבוצה', 'שווי ₪', 'אחוז מהתיק', 'פירוט'])}

    <h2>דיסקליימר <small>${src(m.meta.pageCount)}</small></h2>
    <label class="field"><textarea data-path="disclaimer" rows="4">${esc(m.disclaimer)}</textarea></label>
  `;
  renderChecks();
  $('#confirm-liq').addEventListener('click', () => {
    for (const x of model.managers) if (x.liquidity) { x.liquiditySource = 'saved'; saveOverride(x.id, { liquidity: x.liquidity }); }
    refresh(true);
  });
}

function setPath(obj, path, value) {
  const parts = path.split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) { o[parts[i]] ??= {}; o = o[parts[i]]; }
  o[parts[parts.length - 1]] = value;
}

function onEdit(e) {
  const el = e.target; const path = el.dataset?.path;
  if (!path || !model) return;
  let v = el.value;
  if (el.classList.contains('num')) {
    const t = v.replace(/[,₪%\s]/g, '');
    v = t === '' ? null : Number(t);
    if (t !== '' && !Number.isFinite(v)) { el.setAttribute('aria-invalid', 'true'); return; }
    el.removeAttribute('aria-invalid');
  }
  setPath(model, path, v);
  const mm = path.match(/^managers\.(\d+)\.(liquidity|channel)$/);
  if (mm) {
    const x = model.managers[+mm[1]];
    if (mm[2] === 'liquidity') x.liquiditySource = v ? 'saved' : 'missing';
    saveOverride(x.id, { [mm[2]]: v });
    el.closest('tr')?.classList.toggle('flag', x.liquiditySource !== 'saved');
  }
  refresh(false);
}

// ---------- preview & export ----------
function renderPreview() {
  const z = Number($('#zoom').value) / 100;
  const h = (1123 + 20) * 2;
  $('#preview').innerHTML = `<div style="position:relative;width:${794 * z}px;height:${h * z}px;flex:none"><div style="position:absolute;top:0;left:0;transform:scale(${z});transform-origin:0 0;direction:ltr">${renderReport(model, ASSETS)}</div></div>`;
}

function exportPdf() {
  const errors = model.checks.filter(c => c.level === 'error');
  if (errors.length && !confirm(`יש ${errors.length} שגיאות בבדיקות התקינות:\n${errors.map(e => '• ' + e.text).join('\n')}\n\nלייצא בכל זאת?`)) return;
  $('#print-root').innerHTML = renderReport(model, ASSETS);
  const name = model.meta.clientName ? `FamilyHouse_${model.meta.clientName}_${model.meta.reportDate.replace(/\//g, '-')}` : 'FamilyHouse_Report';
  const prev = document.title; document.title = name;
  const imgs = [...$('#print-root').querySelectorAll('img')];
  Promise.all([document.fonts.ready, ...imgs.map(i => (i.complete ? null : new Promise(r => { i.onload = i.onerror = r; })))]).then(() => {
    window.print();
    document.title = prev;
  });
}

function saveJson() {
  const blob = new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${model.meta.clientName || 'family-house'}_${(model.meta.reportDate || '').replace(/\//g, '-')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- wiring ----------
for (const id of ['#pdf-input', '#pdf-input-2']) $(id).addEventListener('change', e => handlePdf(e.target.files[0]));
$('#json-input').addEventListener('change', e => handleJson(e.target.files[0]));
$('#export-pdf').addEventListener('click', exportPdf);
$('#save-json').addEventListener('click', saveJson);
$('#zoom').addEventListener('input', () => model && renderPreview());
$('#mapping').addEventListener('change', onEdit);
const drop = $('#drop');
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', e => {
  e.preventDefault(); drop.classList.remove('over');
  const f = e.dataTransfer.files[0];
  if (f?.type === 'application/json' || f?.name.endsWith('.json')) handleJson(f); else handlePdf(f);
});
