import { DOC_TYPES } from './config.js';
import { loadCompany } from './storage.js';
import { fmt, escapeHtml } from './utils.js';
import { ICONS } from './icons.js';

let lineSeq = 0;

export function addLine(data){
  lineSeq++;
  const id = 'line_' + lineSeq;
  const tr = document.createElement('tr');
  tr.id = id;
  tr.innerHTML = `
    <td><input type="text" class="line-desig" placeholder="${i18next.t('form.line_placeholder')}" value="${data && data.desig ? escapeHtml(data.desig) : ''}"></td>
    <td class="col-prix"><input type="number" class="line-prix" value="${data ? data.prix : 0}" step="0.01" min="0"></td>
    <td class="col-qte"><input type="number" class="line-qte" value="${data ? data.qte : 1}" step="1" min="0"></td>
    <td class="col-total line-total">0.00 DH</td>
    <td class="col-actions"><button class="icon-btn" aria-label="${i18next.t('form.line_delete')}">${ICONS.x}</button></td>
  `;
  document.getElementById('linesBody').appendChild(tr);
  recalcTotals();
}

export function removeLine(id){
  const el = document.getElementById(id);
  if(el) el.remove();
  recalcTotals();
}

function round2(n){ return Math.round(n * 100) / 100; }

export function getLinesData(){
  const rows = [...document.querySelectorAll('#linesBody tr')];
  return rows.map(tr=>{
    const desig = tr.querySelector('.line-desig').value;
    const prix = Math.max(0, parseFloat(tr.querySelector('.line-prix').value) || 0);
    const qte = Math.max(0, parseFloat(tr.querySelector('.line-qte').value) || 0);
    const total = round2(prix * qte);
    return { desig, prix, qte, total };
  });
}

export function recalcTotals(){
  const lines = getLinesData();
  document.querySelectorAll('#linesBody tr').forEach((tr,i)=>{
    tr.querySelector('.line-total').textContent = fmt(lines[i].total);
  });

  const company = loadCompany();
  const docType = document.getElementById('docType').value;
  const showPrices = (DOC_TYPES[docType] || DOC_TYPES.devis).showTotalsDefault;
  const remisePct = parseFloat(document.getElementById('remise').value) || 0;
  const avance = parseFloat(document.getElementById('avance').value) || 0;

  const totalHT_brut = round2(lines.reduce((s,l)=>s + l.total, 0));
  const remiseMontant = round2(totalHT_brut * remisePct/100);
  const totalHT = round2(totalHT_brut - remiseMontant);

  const isExoneree = company.regimeTva === 'exoneree';
  const tvaTaux = isExoneree ? 0 : (parseFloat(company.tvaTaux) || 0);
  const tva = round2(totalHT * tvaTaux/100);
  const totalTTC = round2(totalHT + tva);
  const reste = round2(totalTTC - avance);

  document.getElementById('sumHT').textContent = fmt(totalHT_brut);
  document.getElementById('sumRemise').textContent = '- ' + fmt(remiseMontant);
  document.getElementById('sumRemiseRow').style.display = (remisePct > 0 && showPrices) ? 'flex' : 'none';
  document.getElementById('sumTvaLabel').textContent = isExoneree ? i18next.t('form.tva') : i18next.t('form.tva_with_rate', {rate: tvaTaux});
  document.getElementById('sumTva').textContent = isExoneree ? i18next.t('lines.tva_exoneree') : fmt(tva);
  document.getElementById('sumTTC').textContent = fmt(totalTTC);
  document.getElementById('sumReste').textContent = fmt(reste);

  const hideAll = !showPrices;
  ['sumTvaRow','sumResteRow'].forEach(id=>document.getElementById(id).style.display = hideAll ? 'none' : 'flex');
  document.querySelector('.summary-row.total').style.display = hideAll ? 'none' : 'flex';
  document.querySelector('#avance').closest('.summary-row').style.display = hideAll ? 'none' : 'flex';
  document.getElementById('sumHT').closest('.summary-row').style.display = hideAll ? 'none' : 'flex';

  return { lines, totalHT_brut, remisePct, remiseMontant, totalHT, isExoneree, tvaTaux, tva, totalTTC, avance, reste, showPrices };
}

export function refreshNotesFromRegime(){
  const company = loadCompany();
  const notes = document.getElementById('notes');
  if(!notes.value || notes.dataset.auto === '1'){
    notes.value = company.regimeTva === 'exoneree'
      ? i18next.t('lines.note_exoneree')
      : '';
    notes.dataset.auto = '1';
  }
}
