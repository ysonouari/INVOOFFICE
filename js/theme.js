export function toggleTheme() {
  const html = document.documentElement;
  const next = html.dataset.theme === 'light' ? 'dark' : 'light';
  html.dataset.theme = next;
  localStorage.setItem('fb_theme', next);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = next === 'light' ? '#ffffff' : '#121a2e';
}

export function getCurrentTheme() {
  return document.documentElement.dataset.theme || 'dark';
}

export function initThemeToggle(buttonId) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  const update = () => {
    const isLight = getCurrentTheme() === 'light';
    btn.textContent = isLight ? '🌙' : '☀️';
    btn.setAttribute('aria-pressed', String(isLight));
  };
  update();
  btn.addEventListener('click', () => { toggleTheme(); update(); });
}
