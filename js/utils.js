import { loadCompany } from './storage.js';

export function escapeHtml(s){
  return (s||'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

export function enforceDigitsOnly(id, maxLen) {
  const el = document.getElementById(id);
  if (!el || el.dataset.enforceDigits === '1') return;
  el.dataset.enforceDigits = '1';
  el.addEventListener('input', () => {
    const start = el.selectionStart;
    const before = el.value.length;
    el.value = el.value.replace(/\D/g, '').slice(0, maxLen);
    const after = el.value.length;
    const newPos = start - (before - after);
    if (newPos >= 0 && newPos <= el.value.length) el.setSelectionRange(newPos, newPos);
  });
}

export function currencySymbol(){
  const c = loadCompany();
  return c.devise || 'DH';
}

export function fmt(n){
  return (isNaN(n)?0:n).toLocaleString('fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' ' + currencySymbol();
}

export function numberToWordsFR(n){
  const units = ['','un','deux','trois','quatre','cinq','six','sept','huit','neuf','dix',
    'onze','douze','treize','quatorze','quinze','seize','dix-sept','dix-huit','dix-neuf'];
  const tens = ['','dix','vingt','trente','quarante','cinquante','soixante','soixante-dix','quatre-vingt','quatre-vingt-dix'];

  function under1000(num){
    let s = '';
    const c = Math.floor(num/100), r = num % 100;
    if(c > 0){
      s += (c > 1 ? units[c] + ' cent' : 'cent') + (c > 1 && r === 0 ? 's' : '');
      if(r > 0) s += ' ';
    }
    if(r > 0){
      if(r < 20){
        s += units[r];
      } else {
        const t = Math.floor(r/10), u = r % 10;
        if(t === 7 || t === 9){
          s += tens[t-1] + (t === 7 && u === 1 ? '-et-' : '-') + units[10+u];
        } else {
          s += tens[t] + (u > 0 ? (u === 1 && t !== 8 ? ' et un' : '-' + units[u]) : (t===8 ? 's' : ''));
        }
      }
    }
    return s.trim();
  }

  if(n === 0) return 'zéro';
  let result = '';
  const millions = Math.floor(n/1000000);
  const milliers = Math.floor((n%1000000)/1000);
  const reste = n % 1000;

  if(millions > 0) result += (millions > 1 ? under1000(millions) + ' millions' : 'un million') + ' ';
  if(milliers > 0) result += (milliers > 1 ? under1000(milliers) + ' mille' : 'mille') + ' ';
  if(reste > 0) result += under1000(reste);

  return result.trim();
}

export function getContrastColor(hex){
  if (!hex) return '#333333';
  let h = hex.replace('#','').trim();
  if (!/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(h)) return '#333333';
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  const r = parseInt(h.substring(0,2),16);
  const g = parseInt(h.substring(2,4),16);
  const b = parseInt(h.substring(4,6),16);
  return (r*0.299 + g*0.587 + b*0.114) > 128 ? '#111111' : '#eef1f6';
}

export function montantEnLettres(totalTTC){
  if (totalTTC < 0) return 'Montant négatif — ' + (-totalTTC).toFixed(2) + ' ' + currencySymbol();
  const entier = Math.floor(totalTTC);
  const centimes = Math.round((totalTTC - entier) * 100);
  let txt = numberToWordsFR(entier) + ' ' + currencySymbol();
  if(centimes > 0) txt += ` et ${numberToWordsFR(centimes)} centime${centimes>1?'s':''}`;
  return txt.charAt(0).toUpperCase() + txt.slice(1) + ' TTC.';
}

export function montantEnLettresAr(totalTTC){
  const entier = Math.floor(totalTTC);
  const centimes = Math.round((totalTTC - entier) * 100);
  let txt = numberToWordsAr(entier) + ' ' + i18next.t('utils.currency');
  if(centimes > 0){
    txt += ' ' + i18next.t('utils.and') + ' ' + numberToWordsAr(centimes) + ' ' + (centimes > 1 ? i18next.t('utils.centimes') : i18next.t('utils.centime'));
  }
  txt += i18next.t('utils.ttc_suffix');
  return txt;
}

function numberToWordsAr(n){
  if(n === 0) return i18next.t('utils.zero');

  const units = ['',
    i18next.t('utils.one'),i18next.t('utils.two'),
    i18next.t('utils.three'),i18next.t('utils.four'),i18next.t('utils.five'),
    i18next.t('utils.six'),i18next.t('utils.seven'),i18next.t('utils.eight'),i18next.t('utils.nine'),
    i18next.t('utils.ten'),i18next.t('utils.eleven'),i18next.t('utils.twelve'),
    i18next.t('utils.thirteen'),i18next.t('utils.fourteen'),i18next.t('utils.fifteen'),
    i18next.t('utils.sixteen'),i18next.t('utils.seventeen'),i18next.t('utils.eighteen'),i18next.t('utils.nineteen')];

  const tens = ['','',
    i18next.t('utils.twenty'),i18next.t('utils.thirty'),i18next.t('utils.forty'),
    i18next.t('utils.fifty'),i18next.t('utils.sixty'),i18next.t('utils.seventy'),
    i18next.t('utils.eighty'),i18next.t('utils.ninety')];

  const fem = ['',
    i18next.t('utils.one_fem'),i18next.t('utils.two_fem'),
    i18next.t('utils.three_fem'),i18next.t('utils.four_fem'),i18next.t('utils.five_fem'),
    i18next.t('utils.six_fem'),i18next.t('utils.seven_fem'),i18next.t('utils.eight_fem'),
    i18next.t('utils.nine_fem'),i18next.t('utils.ten_fem'),
    i18next.t('utils.eleven_fem'),i18next.t('utils.twelve_fem'),
    i18next.t('utils.thirteen_fem'),i18next.t('utils.fourteen_fem'),i18next.t('utils.fifteen_fem'),
    i18next.t('utils.sixteen_fem'),i18next.t('utils.seventeen_fem'),i18next.t('utils.eighteen_fem'),i18next.t('utils.nineteen_fem')];

  function under1000(num){
    let s = '';
    const c = Math.floor(num / 100), r = num % 100;
    if(c > 0){
      if(c === 1) s += i18next.t('utils.hundred_one');
      else if(c === 2) s += i18next.t('utils.hundred_two');
      else s += fem[c] + i18next.t('utils.hundred');
      if(r > 0) s += ' ' + i18next.t('utils.and') + ' ';
    }
    if(r > 0){
      if(r < 20){
        s += units[r];
      } else {
        const t = Math.floor(r / 10), u = r % 10;
        s += (u > 0 ? units[u] + ' ' + i18next.t('utils.and') + ' ' : '') + tens[t];
      }
    }
    return s;
  }

  const parts = [];
  const billions = Math.floor(n / 1000000000);
  const millions = Math.floor((n % 1000000000) / 1000000);
  const thousands = Math.floor((n % 1000000) / 1000);
  const remainder = n % 1000;

  if(billions > 0){
    if(billions === 1) parts.push(i18next.t('utils.billion_one'));
    else if(billions === 2) parts.push(i18next.t('utils.billion_two'));
    else parts.push(under1000(billions) + ' ' + i18next.t('utils.billions'));
  }
  if(millions > 0){
    if(millions === 1) parts.push(i18next.t('utils.million_one'));
    else if(millions === 2) parts.push(i18next.t('utils.million_two'));
    else parts.push(under1000(millions) + ' ' + i18next.t('utils.millions'));
  }
  if(thousands > 0){
    if(thousands === 1) parts.push(i18next.t('utils.thousand_one'));
    else if(thousands === 2) parts.push(i18next.t('utils.thousand_two'));
    else parts.push(under1000(thousands) + ' ' + i18next.t('utils.thousands'));
  }
  if(remainder > 0) parts.push(under1000(remainder));

  return parts.join(' ' + i18next.t('utils.and') + ' ');
}
