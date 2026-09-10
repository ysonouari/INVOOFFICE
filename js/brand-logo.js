import { loadCompany } from './storage.js';

export function updateBrandLogo() {
  const c = loadCompany();
  document.getElementById('brandLogo').textContent = (c.nom || 'SF').substring(0, 2).toUpperCase();
}