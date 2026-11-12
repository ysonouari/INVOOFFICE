/**
 * Password Dialog — Dashboard admin
 * Affiche un mot de passe généré UNE SEULE FOIS, puis l'efface à la fermeture.
 * Le mot de passe n'est jamais stocké (ni base, ni logs, ni localStorage, ni console).
 */

let currentPassword = null;

export function showNewPasswordDialog(password, email) {
  currentPassword = password;

  const overlay = document.getElementById('newPasswordOverlay');
  const prevFocus = document.activeElement;
  const emailEl = document.getElementById('newPasswordEmail');
  const valueEl = document.getElementById('newPasswordValue');
  const closeBtn = overlay.querySelector('[data-action="close-new-password"]');
  const copyBtn = document.getElementById('copyPasswordBtn');
  const copyMsgBtn = document.getElementById('copyMessageBtn');

  emailEl.textContent = email;
  valueEl.textContent = password;
  overlay.style.display = 'flex';

  let closed = false;

  const clear = () => {
    valueEl.textContent = '';
    currentPassword = null;
  };

  const cleanup = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    overlay.removeEventListener('click', onOverlayClick);
    clear();
  };

  const close = (restore = true) => {
    overlay.style.display = 'none';
    cleanup();
    if (restore) { try { prevFocus?.focus(); } catch (_) {} }
  };

  const onKey = (e) => {
    if (e.key === 'Escape') { close(); return; }
    const focusables = [...overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')];
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.key === 'Tab' && e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (e.key === 'Tab' && !e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const onOverlayClick = (e) => { if (e.target === overlay) close(); };

  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', onOverlayClick);
  closeBtn.onclick = () => close();

  const copyText = async (text, btn, doneLabel) => {
    try {
      await navigator.clipboard.writeText(text);
      const old = btn.textContent;
      btn.textContent = doneLabel;
      setTimeout(() => { btn.textContent = old; }, 1500);
    } catch (_) { /* presse-papiers indisponible : on ignore */ }
  };

  copyBtn.onclick = () => { if (currentPassword) copyText(currentPassword, copyBtn, 'Copié !'); };
  copyMsgBtn.onclick = () => {
    if (!currentPassword) return;
    const appUrl = window.location.origin;
    const msg = `Bonjour, voici votre nouveau mot de passe INVOOFFICE : ${currentPassword}. Connectez-vous sur ${appUrl} et pensez à le changer.`;
    copyText(msg, copyMsgBtn, 'Message copié !');
  };

  closeBtn.focus();
  // Re-focus après le restoreFocus() de confirmAction (qui cible le bouton clé).
  setTimeout(() => { if (!closed) closeBtn.focus(); }, 0);
}
