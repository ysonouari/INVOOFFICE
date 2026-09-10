/**
 * Régression sécurité — XSS stocké côté admin
 *
 * Simule le chemin de vulnérabilité : un utilisateur enregistre un `full_name`
 * hostile via le signup, ce nom est journalisé dans `admin_logs.details`
 * (par `modules/admin/user-actions.js`), puis rendu dans les vues admin.
 *
 * Les routes Supabase REST sont mockées avec des fixtures hostiles
 * (`<img ... onerror>`, attribut breakout `">...`, entités `&<>"'`).
 * Les vues doivent afficher le texte brut (échappé) SANS créer d'élément
 * `img`/`script` ni exécuter de code.
 */
import { test, expect, type Page } from '@playwright/test';

const XSS = '<img src=x onerror="window.__xssExecuted=true">';
const BREAKOUT = '"><img src=x onerror="window.__xssExecuted=true">';
const SPECIALS = `A&B<C>D"E'F`;

const OBJECTIVE_ID = 'adm-uid';
const MAL_UID = 'mal-uid';
const TEXT_UID = 'txt-uid';
const BREAK_UID = 'brk-uid';

const PROFILES = [
  {
    id: OBJECTIVE_ID,
    full_name: 'Admin Dev',
    email: 'admin@dev.local',
    whatsapp: '+212600000001',
    role: 'admin',
    status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: MAL_UID,
    full_name: XSS,
    email: 'evil@dev.local',
    whatsapp: '+212600000002',
    role: 'user',
    status: 'active',
    created_at: '2026-01-02T00:00:00.000Z',
  },
  {
    id: TEXT_UID,
    full_name: SPECIALS,
    email: 'text@dev.local',
    whatsapp: '+212600000003',
    role: 'user',
    status: 'pending',
    created_at: '2026-01-02T00:00:00.000Z',
  },
  {
    id: BREAK_UID,
    full_name: BREAKOUT,
    email: 'break@dev.local',
    whatsapp: '+212600000004',
    role: 'user',
    status: 'inactive',
    created_at: '2026-01-02T00:00:00.000Z',
  },
];

const SUBSCRIPTIONS = [
  { user_id: MAL_UID, plan_id: 'p1', status: 'active', activated_at: '2026-01-02T00:00:00.000Z' },
];

const PAYMENT = {
  id: 'pay-1',
  user_id: MAL_UID,
  amount: 30000,
  payment_method: SPECIALS,
  reference: BREAKOUT,
  notes: XSS,
  status: 'completed',
  created_at: '2026-01-03T00:00:00.000Z',
  paid_at: '2026-01-03T00:00:00.000Z',
};

const ADMIN_LOGS = [
  {
    admin_id: OBJECTIVE_ID,
    target_user_id: MAL_UID,
    action: BREAKOUT,
    created_at: '2026-01-03T00:00:00.000Z',
    details: { target_name: XSS, summary: `Utilisateur supprimé: ${XSS}` },
  },
  {
    admin_id: OBJECTIVE_ID,
    target_user_id: TEXT_UID,
    action: 'grant_access',
    created_at: '2026-01-02T00:00:00.000Z',
    details: { target_name: SPECIALS, summary: `Accès à vie attribué à ${SPECIALS}` },
  },
];

async function mockAdminTables(page: Page): Promise<void> {
  await page.route('**/rest/v1/**', async route => {
    const req = route.request();
    if (req.method() !== 'GET') {
      await route.continue();
      return;
    }
    const url = new URL(req.url());
    const match = url.pathname.match(/\/rest\/v1\/([a-z_]+)/);
    const table = match ? match[1] : '';

    let body: unknown = null;
    if (table === 'profiles') {
      body = url.searchParams.toString().includes('id=eq.') ? PROFILES[0] : PROFILES;
    } else if (table === 'subscriptions') {
      body = SUBSCRIPTIONS;
    } else if (table === 'payments') {
      body = [PAYMENT];
    } else if (table === 'admin_logs') {
      body = ADMIN_LOGS;
    } else if (table === 'payment_methods' || table === 'plans' || table === 'platform_settings') {
      body = [];
    }

    if (body === null) {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

async function openAdmin(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as { __xssExecuted?: boolean }).__xssExecuted = false;
  });
  await mockAdminTables(page);
  await page.goto('/admin');
  await expect(page.locator('#adminApp')).toBeVisible();
}

test.describe('Admin — XSS stocké échappé dans toutes les vues', () => {
  test('dashboard : activité récente échappe cibles et descriptions', async ({ page }) => {
    await openAdmin(page);

    await expect(page.locator('#statsGrid .admin-stat-card')).toHaveCount(10);
    await expect(page.locator('#recentActivity tbody tr')).toHaveCount(2);

    await expect(page.locator('#recentActivity')).toContainText(`Utilisateur supprimé: ${XSS}`);
    await expect(page.locator('#recentActivity')).toContainText(`Accès à vie attribué à ${SPECIALS}`);
    await expect(page.locator('#recentActivity')).toContainText(BREAKOUT);

    expect(await page.locator('#recentActivity img').count()).toBe(0);
    expect(await page.locator('#recentActivity script').count()).toBe(0);
    expect(await page.evaluate(() => window.__xssExecuted)).toBeFalsy();
  });

  test('utilisateurs : tableau + fiche détail échappent noms hostiles', async ({ page }) => {
    await openAdmin(page);

    await page.locator('#navUsers').click();
    const rows = page.locator('#usersTable tbody tr');
    await expect(rows).toHaveCount(4);

    const usersText = await page.locator('#usersTable').innerText();
    expect(usersText).toContain(XSS);
    expect(usersText).toContain(BREAKOUT);
    expect(usersText).toContain(SPECIALS);
    expect(await page.locator('#usersTable img').count()).toBe(0);
    expect(await page.locator('#usersTable script').count()).toBe(0);

    await page.locator('#usersTable tbody tr', { hasText: 'evil@dev.local' }).locator('[data-action="detail"]').click();
    await expect(page.locator('#userDetailOverlay')).toBeVisible();

    const detail = page.locator('#userDetailContent');
    await expect(detail).toContainText(XSS);
    await expect(detail).toContainText(`Utilisateur supprimé: ${XSS}`);
    await expect(detail).toContainText(`Accès à vie attribué à ${SPECIALS}`);
    expect(await detail.locator('img, script').count()).toBe(0);

    await page.locator('[data-action="close-user-detail"]').click();
    await expect(page.locator('#userDetailOverlay')).toBeHidden();
    expect(await page.evaluate(() => window.__xssExecuted)).toBeFalsy();
  });

  test('journal : actions, cibles et résumés hostiles restent du texte', async ({ page }) => {
    await openAdmin(page);

    await page.locator('#navLogs').click();
    await expect(page.locator('#logsTable tbody tr')).toHaveCount(2);

    const logsText = await page.locator('#logsTable').innerText();
    expect(logsText).toContain(`Utilisateur supprimé: ${XSS}`);
    expect(logsText).toContain(`Accès à vie attribué à ${SPECIALS}`);
    expect(await page.locator('#logsTable img').count()).toBe(0);
    expect(await page.locator('#logsTable script').count()).toBe(0);
    expect(await page.evaluate(() => window.__xssExecuted)).toBeFalsy();
  });

  test('paiements, méthodes et paramètres : champs dynamiques échappés', async ({ page }) => {
    await openAdmin(page);

    await page.locator('#navPayments').click();
    await expect(page.locator('#paymentsTable tbody tr')).toHaveCount(1);

    const tableText = await page.locator('#paymentsTable').innerText();
    expect(tableText).toContain(SPECIALS);
    expect(tableText).toContain(BREAKOUT);
    expect(await page.locator('#paymentsTable img').count()).toBe(0);

    await page.locator('[data-action="view-payment"]').click();
    const view = page.locator('#paymentDetailContent');
    await expect(view).toBeVisible();
    await expect(view).toContainText(SPECIALS);
    await expect(view).toContainText(BREAKOUT);
    await expect(view).toContainText(XSS);
    expect(await view.locator('img, script').count()).toBe(0);
    await page.locator('[data-action="close-payment-detail"]').click();
    await expect(page.locator('#paymentDetailOverlay')).toBeHidden();

    await page.locator('#navMethods').click();
    await expect(page.locator('#paymentMethodsTable')).toContainText(/Aucune|méthode/i);
    expect(await page.locator('#paymentMethodsTable img').count()).toBe(0);
    expect(await page.locator('#paymentMethodsTable script').count()).toBe(0);

    await page.locator('#navSettings').click();
    await expect(page.locator('#settingsForm #sPlatformName')).toHaveValue('INVOOFFICE');
    expect(await page.locator('#settingsForm img').count()).toBe(0);
    expect(await page.locator('#settingsForm script').count()).toBe(0);

    expect(await page.evaluate(() => window.__xssExecuted)).toBeFalsy();
  });
});