/*
  i18n — internationalisation (fr / ar).
  Utilise i18next + i18next-browser-languagedetector (CDN, chargés avant
  ce module). La clé localStorage fb_lang persiste le choix utilisateur
  en dehors du système ALL_KEYS (ne passe pas par IndexedDB).
*/

const LANG_KEY = 'fb_lang';

async function loadLocale(lng) {
  try {
    const resp = await fetch(`js/locales/${lng}.json?v=${Date.now()}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  } catch (e) {
    console.warn(`i18n: failed to load locale "${lng}" — falling back to empty`, e);
    return {};
  }
}

export async function initI18n() {
  const saved = localStorage.getItem(LANG_KEY);
  const [fr, ar] = await Promise.all([
    loadLocale('fr'),
    loadLocale('ar'),
  ]);
  const resources = {
    fr: { translation: fr },
    ar: { translation: ar },
  };
  try {
    await i18next
      .use(i18nextBrowserLanguageDetector)
      .init({
        lng: saved || undefined,
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
  return new Promise(resolve => {
    i18next.changeLanguage(lng, () => {
      localStorage.setItem(LANG_KEY, lng);
      applyTranslations();
      resolve();
    });
  });
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
