// Admin page for the shared liquidity table.
import { LIQUIDITY } from './config.js';
import { loadTable, saveEntry, deleteEntry, mergedRows } from './store.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const opts = v => `<option value="" ${!v ? 'selected' : ''} disabled>— לבחירה —</option>` +
  Object.entries(LIQUIDITY).map(([k, o]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${o.label}</option>`).join('');
let table;

function msg(text, err = false) { const m = $('#msg'); m.textContent = text; m.classList.toggle('err', err); }
const when = iso => (iso ? new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '');

function render() {
  const q = $('#q').value.trim();
  const rows = mergedRows(table).filter(r => !q || r.name.includes(q));
  const ro = !table.canWrite ? 'disabled' : '';
  $('#rows').innerHTML = rows.map(r => `<tr class="${r.status === 'default' ? 'flag' : ''}" data-key="${esc(r.key)}" data-name="${esc(r.name)}">
    <td class="name">${esc(r.name)}</td>
    <td><select class="liq" aria-label="סוג נזילות ${esc(r.name)}" ${ro}>${opts(r.liquidity)}</select></td>
    <td>${r.status === 'confirmed' ? '<span class="pill ok">מאושר</span>' : '<span class="pill warn">ברירת מחדל זמנית</span>'}</td>
    <td class="muted small">${r.status === 'confirmed' ? `${esc(when(r.updatedAt))}<br>${esc(r.updatedBy || '')}` : ''}</td>
    <td class="acts">${r.status === 'default'
      ? `<button class="btn small confirm" ${ro}>אישור</button>`
      : `<button class="btn small ghost del" ${ro} aria-label="מחיקת ${esc(r.name)}">מחיקה</button>`}</td>
  </tr>`).join('') || '<tr><td colspan="5" class="muted">אין תוצאות</td></tr>';
  const all = mergedRows(table);
  $('#count').textContent = `${all.filter(r => r.status === 'confirmed').length} מאושרים · ${all.filter(r => r.status === 'default').length} זמניים`;
}

async function save(name, liquidity) {
  try { await saveEntry(table, name, liquidity); msg(`נשמר: ${name} – ${LIQUIDITY[liquidity].label}`); }
  catch (e) { msg(e.message, true); }
  render();
}

async function init() {
  $('#add-liq').innerHTML = opts('');
  table = await loadTable();
  $('#mode').textContent = table.mode === 'shared'
    ? `טבלה משותפת (Cloudflare)${table.user ? ` · מחובר כ-${table.user}` : ''}${table.canWrite ? '' : ' · צפייה בלבד'}`
    : 'מצב מקומי: הטבלה נשמרת בדפדפן זה בלבד';
  if (table.error) msg(table.error, true);
  else if (table.mode === 'shared' && !table.canWrite) msg('צפייה בלבד: עריכה דורשת כניסה דרך Cloudflare Access.', true);
  const add = new URLSearchParams(location.search).get('add');
  if (add) $('#add-name').value = add;
  render();
}

$('#rows').addEventListener('change', e => {
  if (!e.target.classList.contains('liq')) return;
  const tr = e.target.closest('tr');
  save(tr.dataset.name, e.target.value);
});
$('#rows').addEventListener('click', async e => {
  const tr = e.target.closest('tr'); if (!tr) return;
  if (e.target.classList.contains('confirm')) save(tr.dataset.name, tr.querySelector('.liq').value);
  if (e.target.classList.contains('del')) {
    if (!confirm(`למחוק את "${tr.dataset.name}" מהטבלה?`)) return;
    try { await deleteEntry(table, tr.dataset.key); msg(`נמחק: ${tr.dataset.name}`); } catch (err) { msg(err.message, true); }
    render();
  }
});
$('#add').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('#add-name').value.trim(), liq = $('#add-liq').value;
  if (!name || !liq) return;
  await save(name, liq);
  $('#add-name').value = ''; $('#add-liq').value = '';
});
$('#confirm-defaults').addEventListener('click', async () => {
  const pending = mergedRows(table).filter(r => r.status === 'default');
  if (!pending.length) return msg('אין ברירות מחדל לאישור');
  if (!confirm(`לאשר ${pending.length} סיווגי ברירת מחדל כפי שהם?`)) return;
  for (const r of pending) {
    try { await saveEntry(table, r.name, r.liquidity); } catch (err) { msg(err.message, true); render(); return; }
  }
  msg(`אושרו ${pending.length} מנהלים`); render();
});
$('#q').addEventListener('input', render);
$('#export-csv').addEventListener('click', () => {
  const lines = [['מנהל', 'סוג נזילות', 'סטטוס', 'עודכן', 'על ידי'], ...mergedRows(table).map(r => [r.name, LIQUIDITY[r.liquidity]?.label || '', r.status === 'confirmed' ? 'מאושר' : 'ברירת מחדל', r.updatedAt || '', r.updatedBy || ''])];
  const csv = '﻿' + lines.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'liquidity-table.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
init();
