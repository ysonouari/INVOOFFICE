import { test as setup, expect } from '@playwright/test';
import path from 'path';

const AUTH_FILE = path.join(__dirname, '.auth', 'user.json');

setup.setTimeout(60000);

setup('authenticate', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.click('button[data-action="show-signin"]');
  await page.locator('#signinOverlay').waitFor({ state: 'visible' });

  await page.fill('#signinEmail', 'ys1onouari@gmail.com');
  await page.fill('#signinPassword', '066790249');
  await page.click('#signinSubmit');

  // Attendre que l'URL change vers /app ou /admin
  await page.waitForFunction(() => {
    const u = window.location.href;
    return u.includes('/app') || u.includes('/admin');
  }, null, { timeout: 20000 });

  // Attendre que la page soit chargée
  await page.waitForLoadState('domcontentloaded');

  await page.context().storageState({ path: AUTH_FILE });
});
