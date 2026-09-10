/*
  i18n — internationalisation (fr / ar).
  Utilise i18next + i18next-browser-languagedetector (CDN, chargés avant
  ce module). La clé localStorage fb_lang persiste le choix utilisateur
  en dehors du système ALL_KEYS (ne passe pas par IndexedDB).

  Groupe D — seule la langue active est chargée au démarrage ; l'autre
  langue est chargée à la demande lors du premier changement de langue.
  Le cache-busting (?v=) reste en place, avec repli sur le chemin sans
  query (précache Service Worker) pour préserver le fonctionnement offline.
*/

const LANG_KEY = 'fb_lang';

let localeCache = {};

function defaultFromNavigator() {
  try {
    return (navigator.language || 'fr').toLowerCase().startsWith('ar') ? 'ar' : 'fr';
  } catch (_) {
    return 'fr';
  }
}

function initialLang() {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved === 'ar' || saved === 'fr') return saved;
  return defaultFromNavigator();
}

async function loadLocale(lng) {
  const busted = `js/locales/${lng}.json?v=${Date.now()}`;
  try {
    const resp = await fetch(busted);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (e) {
    try {
      // Repli offline / precache SW : sans cache-bust, les fichiers sont
      // servis par le Service Worker depuis facturation-v7.
      const resp = await fetch(`js/locales/${lng}.json`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (e2) {
      console.warn(`i18n: failed to load locale "${lng}" — falling back to empty`, e);
      return {};
    }
  }
}

async function bundleFor(lng) {
  if (!localeCache[lng]) {
    localeCache[lng] = await loadLocale(lng);
  }
  return localeCache[lng];
}

export async function initI18n() {
  const lng = initialLang();
  const bundle = await bundleFor(lng);
  const resources = {
    [lng]: { translation: bundle },
  };
  try {
    await i18next
      .use(i18nextBrowserLanguageDetector)
      .init({
        lng,
        fallbackLng: 'fr',
        interpolation: { escapeValue: false, prefix: '{', suffix: '}' },
        detection: { order: ['navigator', 'htmlTag'] },
        resources,
      });
  } catch (e) {
    console.warn('i18n: i18next.init failed — falling back to bare minimum', e);
    await i18next.init({
      lng: 'fr',
      fallbackLng: 'fr',
      interpolation: { escapeValue: false, prefix: '{', suffix: '}' },
      resources: {},
    });
  }
  applyTranslations();
}

export function setLang(lng) {
  if (lng === i18next.language) return Promise.resolve();
  return (async () => {
    if (lng !== 'fr' && lng !== 'ar') return;
    const bundle = await bundleFor(lng);
    if (!i18next.hasResourceBundle(lng, 'translation')) {
      i18next.addResourceBundle(lng, 'translation', bundle, true, true);
    }
    await new Promise(resolve => {
      i18next.changeLanguage(lng, () => resolve());
    });
    localStorage.setItem(LANG_KEY, lng);
    applyTranslations();
  })();
}

export function getCurrentLang() {
  return i18next.language;
}

export function applyTranslations() {
  const t = i18next.t;

  // data-i18n : textContent (ou value pour les OPTION dans <datalist>)
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const text = t(key);
    if (el.tagName === 'OPTION' && el.closest('datalist')) {
      el.value = text;
    } else if (el.tagName === 'OPTION') {
      el.textContent = text;
    } else {
      el.textContent = text;
    }
  });

  // data-i18n-placeholder
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });

  // data-i18n-aria-label
  document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label')));
  });

  // data-i18n-title
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
  });
}