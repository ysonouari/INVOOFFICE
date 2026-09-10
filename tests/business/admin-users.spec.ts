/**
 * Business — Admin users table (Phase E3)
 *
 * Couvre les comportements consolidés en E3 :
 *  - `loadUsersTable()` = seule source de chargement/rechargement
 *    (ex-`refreshUsers()` supprimé) — vérifié via re-fetch GET après action
 *  - `formatDH` = formateur unique pour les badges "Paiement"
 *    (ex-`formatAmount` supprimé)
 *  - `confirmAction` déplacé dans `modules/shared/ui.js` — dialog intact
 *
 * Routes Supabase REST mockées incluant les mutations (PATCH/DELETE/POST),
 * pour un déroulement déterministe sans réseau réel.
 */
import { test, expect, type Page } from '@playwright/test';

const U_ADMIN = { id: 'u-admin', full_name: 'Faiza Admin', email: 'admin@e3.local', whatsapp: '+212600000001', role: 'admin', status: 'active', created_at: '2026-02-01T00:00:00.000Z' };
const U_PAID = { id: 'u-paid', full_name: 'Karim Client', email: 'paid@e3.local', whatsapp: '+212600000002', role: 'user', status: 'active', created_at: '2026-02-02T00:00:00.000Z' };
const U_PEND = { id: 'u-pend', full_name: 'Salma Enattente', email: 'pending@e3.local', whatsapp: '+212600000003', role: 'user', status: 'pending', created_at: '2026-02-03T00:00:00.000Z' };

const PROFILES = [U_ADMIN, U_PAID, U_PEND];

const PAYMENTS = [
  { id: 'pay-big', user_id: U_PAID.id, amount: 12345600, status: 'completed', created_at: '2026-02-04T00:00:00.000Z' },
  { id: 'pay-small', user_id: U_ADMIN.id, amount: 30000, status: 'completed', created_at: '2026-02-05T00:00:00.000Z' },
];

async function mockAdminTables(page: Page): Promise<void> {
  await page.route('**/rest/v1/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const match = url.pathname.match(/\/rest\/v1\/([a-z_]+)/);
    const table = match ? match[1] : '';

    let body: unknown;
    if (req.method() === 'GET') {
      if (table === 'profiles') {
        body = url.searchParams.toString().includes('id=eq.') ? U_ADMIN : PROFILES;
      } else if (table === 'subscriptions') {
        body = [];
      } else if (table === 'payments') {
        body = PAYMENTS;
      } else if (table === 'admin_logs') {
        body = [];
      } else if (table === 'payment_methods' || table === 'plans' || table === 'platform_settings') {
        body = [];
      } else {
        await route.continue();
        return;
      }
    } else {
      // Mutations mockées (PATCH/DELETE/POST) : succès vide, aucune donnée réelle touchée
      body = [];
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

async function openUsers(page: Page): Promise<void> {
  await mockAdminTables(page);
  await page.goto('/admin');
  await expect(page.locator('#adminApp')).toBeVisible();
  await page.locator('#navUsers').click();
  await expect(page.locator('#usersTable tbody tr')).toHaveCount(3);
}

test.describe('Admin — Users table (Phase E3)', () => {
  test('montants "Paiement" formatés via formatDH (grouping fr-FR, cohérent avec le reste)', async ({ page }) => {
    await openUsers(page);

    const big = page.locator('#usersTable tbody tr', { hasText: 'paid@e3.local' }).locator('.admin-badge-paid');
    const expected = (await page.evaluate(() => (123456).toLocaleString('fr-FR'))) + ' DH';
    await expect(big).toHaveText(expected);

    const small = page.locator('#usersTable tbody tr', { hasText: 'admin@e3.local' }).locator('.admin-badge-paid');
    await expect(small).toHaveText('300 DH');
  });

  test('recherche + filtres conservent le comportement (pagination/filtrage préservés)', async ({ page }) => {
    await openUsers(page);

    await page.locator('#userSearch').fill('pending@e3.local');
    await expect(page.locator('#usersTable tbody tr')).toHaveCount(1);
    await expect(page.locator('#usersTable')).toContainText('Salma Enattente');

    await page.locator('#userSearch').fill('');
    await expect(page.locator('#usersTable tbody tr')).toHaveCount(3);

    await page.locator('.admin-filter-pill[data-filter="active"]').click();
    await expect(page.locator('#usersTable tbody tr')).toHaveCount(2);

    await page.locator('.admin-filter-pill[data-filter="all"]').click();
    await expect(page.locator('#usersTable tbody tr')).toHaveCount(3);
  });

  test('confirmAction (déplacé) : dialog supprimer + annulation puis confirmation re-fetch', async ({ page }) => {
    await openUsers(page);

    const row = page.locator('#usersTable tbody tr', { hasText: 'admin@e3.local' });
    await row.locator('[data-action="delete"]').click();

    await expect(page.locator('#confirmOverlay')).toBeVisible();
    await expect(page.locator('#confirmTitle')).toHaveText('Supprimer');
    await expect(page.locator('#confirmMessage')).toContainText('Faiza Admin');
    await expect(page.locator('#confirmMessage')).toContainText('irréversible');

    await page.locator('#confirmCancel').click();
    await expect(page.locator('#confirmOverlay')).toBeHidden();
    await expect(page.locator('#usersTable tbody tr')).toHaveCount(3);

    await row.locator('[data-action="delete"]').click();
    await expect(page.locator('#confirmOverlay')).toBeVisible();
    const refetch = page.waitForResponse(r => r.url().includes('/rest/v1/profiles') && r.request().method() === 'GET');
    await page.locator('#confirmOk').click();
    await expect(page.locator('#confirmOverlay')).toBeHidden();
    await refetch;

    await expect(page.locator('#usersTable tbody tr')).toHaveCount(3);
    await expect(page.locator('#usersTable')).toContainText('Faiza Admin');
  });
});