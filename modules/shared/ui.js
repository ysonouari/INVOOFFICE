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
