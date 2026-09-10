/*
  pdf-dependencies — chargement à la demande (lazy import) de html2canvas et jsPDF.
  Retirés du boot de app.html (~550 Ko inutiles au premier affichage), ces deux
  bibliothèques sont injectées uniquement à la première génération de PDF.
  Même pattern que ensurePdfKit() (js/pdfkit-engine.js) :
  - une seule charge réseau par bibliothèque (Promise partagée) ;
  - zéro double ajout de <script> en cas d'appels simultanés ;
  - integrity SRI + crossorigin anonyme préservés (identiques aux balises retirées) ;
  - échec de chargement → rejet propre + nouvelle tentative possible ensuite ;
  - hors-ligne : CDN jamais intercepté par le Service Worker (sw.js ignore les
    origines tierces), comportement identique à avant (moteur par défaut PDFKit
    reste disponible offline via le precache : bundle + entit.png + polices).
*/
const CDN = {
  html2canvas: {
    src: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    integrity: 'sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H',
  },
  jspdf: {
    src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    integrity: 'sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk',
  },
};

const loading = {};

function loadScript(src, integrity) {
  if (!loading[src]) {
    loading[src] = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.integrity = integrity;
      script.crossOrigin = 'anonymous';
      script.onload = () => resolve();
      script.onerror = () => {
        delete loading[src];
        reject(new Error('Impossible de charger ' + src));
      };
      document.head.appendChild(script);
    });
  }
  return loading[src];
}

export function ensureHtml2Canvas() {
  if (window.html2canvas) return Promise.resolve();
  return loadScript(CDN.html2canvas.src, CDN.html2canvas.integrity);
}

export function ensureJsPdf() {
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
  return loadScript(CDN.jspdf.src, CDN.jspdf.integrity);
}