/**
 * Shared — utilitaires Admin minimaux
 * Encodage de sortie unique pour le dashboard admin.
 * Échappement complet et cohérent (& < > " ') pour contenu texte et attributs HTML.
 */

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[m]));
}

export function escAttr(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[m]));
}