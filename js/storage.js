import { DOC_TYPES } from './config.js';

/* ---------- IndexedDB helpers ---------- */

const DB_NAME = 'fb_app';
const DB_VERSION = 1;
const STORE_NAME = 'kv_store';
const ALL_KEYS = ['company', 'history', 'clients'];

let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains(STORE_NAME)) d.createObjectStore(STORE_NAME);
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function dbPut(key, value) {
  if (!db) return;
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.onerror = () => console.warn('IndexedDB write failed for key:', key);
  } catch (e) { console.warn('IndexedDB write exception:', e); }
}

function dbGet(key) {
  if (!db) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { console.warn('IndexedDB read failed for key:', key); resolve(null); };
    } catch (_) { resolve(null); }
  });
}

/* ---------- In-memory cache ---------- */

const cache = { company: null, history: null, clients: null };
let gen = 0;

function lsKey(k) { return 'fb_' + k; }

function migrateHistoryIds(arr) {
  let changed = false;
  arr.forEach(d => {
    if (!d.id) {
      d.id = 'doc_' + Date.now() + '_' + Math.random().toString(36).slice(2,9);
      changed = true;
    }
  });
  return changed;
}

function cacheFromLocalStorage() {
  for (const key of ALL_KEYS) {
    const raw = localStorage.getItem(lsKey(key));
    if (raw) {
      try { cache[key] = JSON.parse(raw); } catch (_) {}
    }
  }
  if (cache.history && migrateHistoryIds(cache.history)) {
    try { localStorage.setItem(lsKey('history'), JSON.stringify(cache.history)); }
    catch (e) { console.warn('localStorage write failed (quota?):', e); }
  }
}

/* ---------- Public API ---------- */

export async function initStorage() {
  cacheFromLocalStorage();
  const startGen = gen;
  try {
    db = await openDB();
    for (const key of ALL_KEYS) {
      if (gen !== startGen) break;
      const val = await dbGet(key);
      if (gen !== startGen) break;
      if (val !== null && val !== undefined) {
        cache[key] = val;
        try { localStorage.setItem(lsKey(key), JSON.stringify(val)); }
        catch (e) { console.warn('localStorage write failed in initStorage for', key, e); }
      } else if (cache[key] !== null) {
        dbPut(key, cache[key]);
      }
    }
  } catch (_) {
    db = null;
  }
}

export function loadCompany() {
  if (cache.company) return cache.company;
  const raw = localStorage.getItem(lsKey('company'));
  if (raw) {
    cache.company = JSON.parse(raw);
    return cache.company;
  }
  const def = {
    nom:'', contact:'', adresse:'',
    devise:'DH', regimeTva:'normal', tvaTaux:20,
    ice:'', if_:'', rc:'', tp:'', cnss:'',
    tableColor:'#eef1f6', tableTextColor:'#333333', margeHaut:3,
    fontSizeOffset:0,
    headerImage:'', headerActive:false,
  };
  cache.company = def;
  return def;
}

export function saveCompany(c) {
  gen++;
  cache.company = c;
  try { localStorage.setItem(lsKey('company'), JSON.stringify(c)); }
  catch (e) { console.warn('localStorage quota exceeded for company:', e); }
  dbPut('company', c);
}

export function loadHistory() {
  if (cache.history) return cache.history;
  const raw = localStorage.getItem(lsKey('history'));
  cache.history = raw ? JSON.parse(raw) : [];
  if (migrateHistoryIds(cache.history)) {
    try { localStorage.setItem(lsKey('history'), JSON.stringify(cache.history)); }
    catch (e) { console.warn('localStorage write failed for history migration:', e); }
    dbPut('history', cache.history);
  }
  return cache.history;
}

export function saveHistory(h) {
  gen++;
  cache.history = h;
  try { localStorage.setItem(lsKey('history'), JSON.stringify(h)); }
  catch (e) { console.warn('localStorage quota exceeded for history:', e); }
  dbPut('history', h);
}

export function loadClients() {
  if (!cache.clients) {
    const raw = localStorage.getItem(lsKey('clients'));
    cache.clients = raw ? JSON.parse(raw) : [];
  }
  let changed = false;
  cache.clients = cache.clients.map(c => {
    if (!c.id) { c.id = 'client_' + Date.now() + '_' + Math.random().toString(36).slice(2,9); changed = true; }
    if (c.ice === undefined) { c.ice = ''; changed = true; }
    return c;
  });
  if (changed) saveClients(cache.clients);
  return cache.clients;
}

export function saveClients(c) {
  gen++;
  cache.clients = c;
  try { localStorage.setItem(lsKey('clients'), JSON.stringify(c)); }
  catch (e) { console.warn('localStorage quota exceeded for clients:', e); }
  dbPut('clients', c);
}

export function nextNumero(type) {
  const year = new Date().getFullYear();
  const prefix = (DOC_TYPES[type] || DOC_TYPES.devis).prefix;
  const history = loadHistory();
  const re = new RegExp('^' + prefix + '-' + year + '-(\\d+)$');
  let maxN = 0;
  for (const doc of history) {
    if (doc.type !== type) continue;
    const m = doc.numero && doc.numero.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxN) maxN = n;
    }
  }
  const n = maxN + 1;
  const key = type + '-' + year;
  return { display: `${prefix}-${year}-${String(n).padStart(4,'0')}`, key, n };
}
