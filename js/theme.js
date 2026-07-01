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
