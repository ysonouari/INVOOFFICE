import { DOC_TYPES } from './config.js';
import { loadCompany } from './storage.js';
import { fmt, escapeHtml, currencySymbol } from './utils.js';
import { ICONS } from './icons.js';
import {
  CALC_MODES,
  DIMENSION_LABEL_KEYS,
  normalizeCalcMode,
  computeMeasure,
  isLineBillable,
  unitForMode,
  formatMeasure,
  round2,
} from './calc.js';

let lineSeq = 0;

const DIMENSION_INPUTS = {
  longueurCm: { cls: 'line-long' },
  largeurCm: { cls: 'line-larg' },
  hauteurCm: { cls: 'line-haut' },
};

function modeOptions(selected) {
  return CALC_MODES.map((m) => {
    const label = i18next.t('form.calc_mode_' + m);
    const sel = m === selected ? ' selected' : '';
    return `<option value="${m}"${sel}>${escapeHtml(label)}</option>`;
  }).join('');
}

function valueAttr(v, fallback = '') {
  return escapeHtml(String(v === undefined || v === null || v === '' ? fallback : v));
}

function normalizeLineData(data) {
  data = data || {};
  return {
    desig: data.desig === undefined || data.desig === null ? '' : String(data.desig),
    prix: data.prix === undefined || data.prix === null || data.prix === '' ? 0 : data.prix,
    qte: data.qte === undefined || data.qte === null || data.qte === '' ? 1 : data.qte,
    longueurCm: data.longueurCm === undefined || data.longueurCm === null ? '' : data.longueurCm,
    largeurCm: data.largeurCm === undefined || data.largeurCm === null ? '' : data.largeurCm,
    hauteurCm: data.hauteurCm === undefined || data.hauteurCm === null ? '' : data.hauteurCm,
    calcMode: normalizeCalcMode(data.calcMode),
  };
}

function dimensionInput(key, data) {
  const meta = DIMENSION_INPUTS[key];
  const label = i18next.t(DIMENSION_LABEL_KEYS[key]);
  return `<input type="number" class="${meta.cls}" aria-label="${escapeHtml(label)}" placeholder="${escapeHtml(label)}" value="${valueAttr(data[key])}" step="0.01" min="0" inputmode="decimal">`;
}

function dimensionInputsForMode(mode, data) {
  if (mode === 'm2') {
    return dimensionInput('largeurCm', data) + dimensionInput('hauteurCm', data);
  }
  if (mode === 'ml') {
    return dimensionInput('longueurCm', data);
  }
  if (mode === 'm3') {
    return dimensionInput('longueurCm', data) + dimensionInput('largeurCm', data) + dimensionInput('hauteurCm', data);
  }
  return '';
}

function renderRowHtml(data, animate) {
  const d = normalizeLineData(data);
  const mode = d.calcMode;
  const anim = animate ? ' line-field-appear' : '';
  const unit = unitForMode(mode);

  const desigLabel = i18next.t('form.line_designation');
  const priceLabel = unit
    ? i18next.t('form.line_price_unit', { currency: currencySymbol(), unit })
    : i18next.t('form.line_price');
  const qtyLabel = i18next.t('form.line_qty');

  const dimsHtml = dimensionInputsForMode(mode, d);
  const dimsBlock = dimsHtml
    ? `<div class="line-dims${anim}">${dimsHtml}<span class="line-mesure">—</span></div>`
    : '';
  const priceUnitHtml = unit
    ? `<span class="line-prix-unit">${escapeHtml(currencySymbol() + '/' + unit)}</span>`
    : '';

  return `
    <td data-label="${escapeHtml(desigLabel)}"><input type="text" class="line-desig" aria-label="${escapeHtml(desigLabel)}" placeholder="${escapeHtml(i18next.t('form.line_placeholder'))}" value="${valueAttr(d.desig)}">
      <div class="line-config">
        <select class="line-mode" aria-label="${escapeHtml(i18next.t('form.calc_mode'))}">${modeOptions(mode)}</select>
        ${dimsBlock}
      </div>
    </td>
    <td class="col-prix" data-label="${escapeHtml(priceLabel)}"><input type="number" class="line-prix" aria-label="${escapeHtml(priceLabel)}" value="${valueAttr(d.prix, 0)}" step="0.01" min="0" inputmode="decimal">${priceUnitHtml}</td>
    <td class="col-qte" data-label="${escapeHtml(qtyLabel)}"><input type="number" class="line-qte" aria-label="${escapeHtml(qtyLabel)}" value="${valueAttr(d.qte, 1)}" step="1" min="0" inputmode="decimal"></td>
    <td class="col-total line-total">0.00 DH</td>
    <td class="col-actions"><button class="icon-btn" aria-label="${escapeHtml(i18next.t('form.line_delete'))}">${ICONS.x}</button></td>`;
}

function readRowData(tr) {
  const data = Object.assign({}, tr._lineData || {});
  const q = (sel) => tr.querySelector(sel);
  const desig = q('.line-desig');
  const prix = q('.line-prix');
  const qte = q('.line-qte');
  const modeSel = q('.line-mode');
  if (desig) data.desig = desig.value;
  if (prix) data.prix = prix.value;
  if (qte) data.qte = qte.value;
  if (modeSel) data.calcMode = modeSel.value;
  for (const [key, meta] of Object.entries(DIMENSION_INPUTS)) {
    const input = q('.' + meta.cls);
    if (input) data[key] = input.value;
  }
  tr._lineData = normalizeLineData(data);
  return tr._lineData;
}

export function addLine(data) {
  lineSeq++;
  const tr = document.createElement('tr');
  tr.id = 'line_' + lineSeq;
  tr._lineData = normalizeLineData(data);
  tr.innerHTML = renderRowHtml(tr._lineData, false);
  document.getElementById('linesBody').appendChild(tr);
  recalcTotals();
}

export function removeLine(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
  recalcTotals();
}

export function setLineMode(tr, mode, { animate = true } = {}) {
  if (!tr) return;
  const data = readRowData(tr);
  data.calcMode = normalizeCalcMode(mode);
  tr._lineData = data;
  tr.innerHTML = renderRowHtml(data, animate);
  recalcTotals();
}

export function getLinesData() {
  const rows = [...document.querySelectorAll('#linesBody tr')];
  return rows.map((tr) => {
    const raw = readRowData(tr);
    const mode = normalizeCalcMode(raw.calcMode);
    const line = {
      desig: raw.desig,
      prix: Math.max(0, parseFloat(raw.prix) || 0),
      qte: Math.max(0, parseFloat(raw.qte) || 0),
      longueurCm: raw.longueurCm,
      largeurCm: raw.largeurCm,
      hauteurCm: raw.hauteurCm,
      calcMode: mode,
    };
    const billable = isLineBillable(line);
    let measureValid = true;
    let measureValue = 0;
    let invalidFields = [];
    let total = 0;

    if (mode === 'forfait') {
      total = round2(line.prix * line.qte);
    } else if (billable) {
      const measure = computeMeasure(mode, line);
      measureValid = measure.valid;
      measureValue = measure.valid ? measure.value : null;
      invalidFields = measure.invalid;
      total = measure.valid ? round2(line.prix * line.qte * measure.value) : null;
    }

    return Object.assign({}, line, {
      billable,
      measureValid,
      measureValue,
      measureUnit: unitForMode(mode),
      invalidFields,
      total,
    });
  });
}

export function recalcTotals() {
  const lines = getLinesData();
  const rows = [...document.querySelectorAll('#linesBody tr')];

  rows.forEach((tr, i) => {
    const line = lines[i];
    const totalEl = tr.querySelector('.line-total');
    if (totalEl) {
      totalEl.textContent = line.total === null ? '—' : fmt(line.total);
      totalEl.classList.toggle('line-total-invalid', line.total === null);
    }

    const measureEl = tr.querySelector('.line-mesure');
    if (measureEl) {
      if (line.billable && !line.measureValid) {
        measureEl.textContent = '—';
        measureEl.classList.add('line-measure-invalid');
        measureEl.title = i18next.t('form.line_measure_invalid');
      } else {
        measureEl.textContent = formatMeasure(line.calcMode, line.measureValue) + ' ' + line.measureUnit;
        measureEl.classList.remove('line-measure-invalid');
        measureEl.removeAttribute('title');
      }
    }

    const invalid = new Set(line.billable ? line.invalidFields : []);
    for (const [key, meta] of Object.entries(DIMENSION_INPUTS)) {
      const input = tr.querySelector('.' + meta.cls);
      if (!input) continue;
      if (invalid.has(key)) {
        input.classList.add('input-error');
        input.setAttribute('aria-invalid', 'true');
        input.title = i18next.t('form.line_dimension_invalid', { field: i18next.t(DIMENSION_LABEL_KEYS[key]) });
      } else {
        input.classList.remove('input-error');
        input.removeAttribute('aria-invalid');
        input.removeAttribute('title');
      }
    }
  });

  const company = loadCompany();
  const docType = document.getElementById('docType').value;
  const showPrices = (DOC_TYPES[docType] || DOC_TYPES.devis).showTotalsDefault;
  const remisePct = Math.max(0, parseFloat(document.getElementById('remise').value) || 0);
  const avance = parseFloat(document.getElementById('avance').value) || 0;

  const totalHT_brut = round2(lines.reduce((s, l) => s + (l.total || 0), 0));
  const remiseMontant = round2(totalHT_brut * remisePct / 100);
  const totalHT = round2(totalHT_brut - remiseMontant);

  const isExoneree = company.regimeTva === 'exoneree';
  const tvaTaux = isExoneree ? 0 : (parseFloat(company.tvaTaux) || 0);
  const tva = round2(totalHT * tvaTaux / 100);
  const totalTTC = round2(totalHT + tva);
  const reste = round2(totalTTC - avance);

  document.getElementById('sumHT').textContent = fmt(totalHT_brut);
  document.getElementById('sumRemise').textContent = '- ' + fmt(remiseMontant);
  document.getElementById('sumRemiseRow').style.display = (remisePct > 0 && showPrices) ? 'flex' : 'none';
  document.getElementById('sumTvaLabel').textContent = isExoneree ? i18next.t('form.tva') : i18next.t('form.tva_with_rate', { rate: tvaTaux });
  document.getElementById('sumTva').textContent = isExoneree ? i18next.t('lines.tva_exoneree') : fmt(tva);
  document.getElementById('sumTTC').textContent = fmt(totalTTC);
  document.getElementById('sumReste').textContent = fmt(reste);

  const hideAll = !showPrices;
  ['sumTvaRow', 'sumResteRow'].forEach(id => document.getElementById(id).style.display = hideAll ? 'none' : 'flex');
  document.querySelector('.summary-row.total').style.display = hideAll ? 'none' : 'flex';
  document.querySelector('#avance').closest('.summary-row').style.display = hideAll ? 'none' : 'flex';
  document.getElementById('sumHT').closest('.summary-row').style.display = hideAll ? 'none' : 'flex';

  return { lines, totalHT_brut, remisePct, remiseMontant, totalHT, isExoneree, tvaTaux, tva, totalTTC, avance, reste, showPrices };
}

export function refreshLinesUI({ animate = false } = {}) {
  const rows = [...document.querySelectorAll('#linesBody tr')];
  const raws = rows.map(readRowData);
  rows.forEach((tr, i) => {
    tr._lineData = raws[i];
    tr.innerHTML = renderRowHtml(raws[i], animate);
  });
  recalcTotals();
}

export { CALC_MODES };

export function refreshNotesFromRegime() {
  const company = loadCompany();
  const notes = document.getElementById('notes');
  if (!notes.value || notes.dataset.auto === '1') {
    notes.value = company.regimeTva === 'exoneree'
      ? i18next.t('lines.note_exoneree')
      : '';
    notes.dataset.auto = '1';
  }
}
