/**
 * Utilitaires UI partagés
 * Composants réutilisables pour tous les modules SaaS
 */

export function createElement(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'className') el.className = value;
    else if (key === 'dataset') Object.entries(value).forEach(([k, v]) => el.dataset[k] = v);
    else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'html') el.innerHTML = value;
    else if (key === 'text') el.textContent = value;
    else el.setAttribute(key, value);
  });
  children.forEach(child => {
    if (typeof child === 'string') el.appendChild(document.createTextNode(child));
    else if (child) el.appendChild(child);
  });
  return el;
}

export function showToast(message, type = 'info', duration = 3000) {
  const existing = document.querySelector('.lp-toast');
  if (existing) existing.remove();

  const toast = createElement('div', { className: `lp-toast lp-toast-${type}` }, [message]);
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('lp-toast-visible'));

  setTimeout(() => {
    toast.classList.remove('lp-toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

export function confirmAction(title, message, onConfirm) {
  const overlay = document.getElementById('confirmOverlay');
  const prevFocus = document.activeElement;
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  overlay.style.display = 'flex';
  const ok = document.getElementById('confirmOk');
  const cancel = document.getElementById('confirmCancel');
  let closed = false;
  const focusables = () => [...overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')];
  const restoreFocus = () => {
    if (!prevFocus || typeof prevFocus.focus !== 'function') return;
    try { prevFocus.focus(); } catch (_) {}
  };
  const cleanup = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    overlay.removeEventListener('click', onOverlayClick);
  };
  const close = (restore = true) => {
    overlay.style.display = 'none';
    cleanup();
    if (restore) restoreFocus();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { close(); return; }
    const f = focusables();
    if (f.length === 0) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.key === 'Tab' && e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (e.key === 'Tab' && !e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  const onOverlayClick = (e) => { if (e.target === overlay) close(); };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', onOverlayClick);
  cancel.onclick = () => close();
  ok.onclick = async () => { close(false); await onConfirm(); restoreFocus(); };
  ok.focus();
}
