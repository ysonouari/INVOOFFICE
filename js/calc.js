/*
  Calculs de lignes — source unique partagée par l'éditeur (js/lines.js)
  et le rendu PDF (js/pdf.js). Les dimensions sont stockées brutes en cm.
  Le mode de calcul est porté par CHAQUE ligne (calcMode) ; le paramètre
  fallback de resolveLineMode assure la migration des documents de la
  première version (mode global totals.calcMode) et des documents sans
  mode (→ forfait).
*/

export const CALC_MODES = ['forfait', 'm2', 'ml', 'm3'];

export const DIMENSION_KEYS = {
  m2: ['largeurCm', 'hauteurCm'],
  ml: ['longueurCm'],
  m3: ['longueurCm', 'largeurCm', 'hauteurCm'],
};

export const DIMENSION_LABEL_KEYS = {
  longueurCm: 'form.line_length',
  largeurCm: 'form.line_width',
  hauteurCm: 'form.line_height',
};

export function normalizeCalcMode(mode) {
  return CALC_MODES.includes(mode) ? mode : 'forfait';
}

export function resolveLineMode(line, fallbackMode) {
  const own = line ? line.calcMode : undefined;
  if (own !== undefined && own !== null && String(own).trim() !== '') {
    return normalizeCalcMode(own);
  }
  return normalizeCalcMode(fallbackMode);
}

export function round2(n) {
  return Math.round(n * 100) / 100;
}

export function unitForMode(mode) {
  mode = normalizeCalcMode(mode);
  if (mode === 'm2') return 'm²';
  if (mode === 'ml') return 'm';
  if (mode === 'm3') return 'm³';
  return '';
}

export function parseDimension(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { valid: false, empty: true, value: 0 };
  }
  const n = Number(String(raw).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return { valid: false, empty: false, value: 0 };
  return { valid: true, empty: false, value: n };
}

export function computeMeasure(mode, line) {
  mode = normalizeCalcMode(mode);
  if (mode === 'forfait') return { valid: true, value: 1, unit: '', invalid: [] };

  const values = {};
  const invalid = [];
  for (const key of DIMENSION_KEYS[mode]) {
    const parsed = parseDimension(line ? line[key] : '');
    if (!parsed.valid) invalid.push(key);
    else values[key] = parsed.value;
  }
  if (invalid.length) return { valid: false, value: null, unit: unitForMode(mode), invalid };

  let value;
  if (mode === 'm2') value = values.largeurCm * values.hauteurCm / 10000;
  else if (mode === 'ml') value = values.longueurCm / 100;
  else value = values.longueurCm * values.largeurCm * values.hauteurCm / 1000000;

  return { valid: true, value, unit: unitForMode(mode), invalid: [] };
}

export function computeLineTotal(mode, line) {
  mode = normalizeCalcMode(mode);
  const prix = Math.max(0, parseFloat(line ? line.prix : 0) || 0);
  const qte = Math.max(0, parseFloat(line ? line.qte : 0) || 0);
  if (mode === 'forfait') {
    return { total: round2(prix * qte), measure: { valid: true, value: 1, unit: '', invalid: [] } };
  }
  const measure = computeMeasure(mode, line);
  if (!measure.valid) return { total: null, measure };
  return { total: round2(prix * qte * measure.value), measure };
}

export function isLineBillable(line) {
  if (!line) return false;
  if (String(line.desig || '').trim() !== '') return true;
  if ((parseFloat(line.prix) || 0) > 0) return true;
  const qte = parseFloat(line.qte);
  if (Number.isFinite(qte) && qte !== 1) return true;
  return ['longueurCm', 'largeurCm', 'hauteurCm'].some(
    (key) => line[key] !== undefined && line[key] !== null && String(line[key]).trim() !== ''
  );
}

export function formatMeasure(mode, value) {
  const digits = normalizeCalcMode(mode) === 'm3' ? 3 : 2;
  return Number(value || 0).toLocaleString('fr-FR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
