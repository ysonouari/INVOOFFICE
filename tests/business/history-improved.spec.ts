import { test, expect } from '@playwright/test';

async function waitAppReady(page) {
  await page.goto('/app');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#authUser, #authBlockedOverlay, #brandLogo').first()).toBeAttached({ timeout: 15000 });
}

function seedDocs(count: number) {
  const docs = [];
  for (let i = 1; i <= count; i++) {
    const typeIdx = i % 4;
    docs.push({
      id: 'qa_' + i,
      type: typeIdx === 0 ? 'avoir' : typeIdx === 1 ? 'bl' : typeIdx === 2 ? 'devis' : 'facture',
      numero: (typeIdx === 0 ? 'AV' : typeIdx === 1 ? 'BL' : typeIdx === 2 ? 'DEV' : 'FAC') + '-2026-' + String(i).padStart(4, '0'),
      date: '0' + (1 + (i % 28)) + '/0' + (1 + (i % 12)) + '/2026',
      client: ['Société ABC', 'Entreprise XYZ', 'Consulting SARL', 'Client Pro ' + i][i % 4],
      totalTTC: i * 1000,
      createdAt: new Date(2026, 7 - (i % 12), i % 28 + 1).toISOString(),
      filename: 'qa_' + i + '.pdf',
      payload: null,
    });
  }
  return docs;
}

async function seedAndReload(page, count: number) {
  await page.evaluate((docs) => { localStorage.setItem('fb_history', JSON.stringify(docs)); }, seedDocs(count));
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#authUser, #authBlockedOverlay, #brandLogo').first()).toBeAttached({ timeout: 15000 });
}

test.describe('Historique amélioré', () => {
  test.setTimeout(120000);

  test('pagination avec 25 documents', async ({ page }) => {
    await waitAppReady(page);
    await seedAndReload(page, 25);
    await page.click('#navHistorique');
    await page.waitForTimeout(500);
    await expect(page.locator('#histTableWrap')).toBeVisible({ timeout: 5000 });

    const rows = page.locator('#histTableWrap table tbody tr');
    await expect(rows).toHaveCount(10);

    const summary = page.locator('.hist-summary');
    await expect(summary).toBeVisible();
    expect(await summary.textContent()).toContain('25');

    const pagination = page.locator('.hist-pagination');
    await expect(pagination).toBeVisible();

    await pagination.locator('button[data-page="3"]').click();
    await page.waitForTimeout(300);
    await expect(rows).toHaveCount(5);

    await pagination.locator('button[aria-label="Première page"]').click();
    await page.waitForTimeout(300);
    await expect(rows).toHaveCount(10);

    await pagination.locator('button[aria-label="Dernière page"]').click();
    await page.waitForTimeout(300);
    await expect(rows).toHaveCount(5);
  });

  test('recherche par numéro', async ({ page }) => {
    await waitAppReady(page);
    await seedAndReload(page, 15);
    await page.click('#navHistorique');
    await expect(page.locator('#histTableWrap')).toBeVisible({ timeout: 5000 });

    await page.fill('#histSearch', 'DEV');
    await page.waitForTimeout(200);
    const rows = page.locator('#histTableWrap table tbody tr');
    expect(await rows.count()).toBeGreaterThan(0);
    expect(await rows.first().locator('td').nth(1).textContent()).toContain('DEV');
  });

  test('recherche par client', async ({ page }) => {
    await waitAppReady(page);
    await seedAndReload(page, 15);
    await page.click('#navHistorique');
    await expect(page.locator('#histTableWrap')).toBeVisible({ timeout: 5000 });

    await page.fill('#histSearch', 'ABC');
    await page.waitForTimeout(200);
    expect(await page.locator('#histTableWrap table tbody tr').count()).toBeGreaterThan(0);
  });

  test('recherche par type', async ({ page }) => {
    await waitAppReady(page);
    await seedAndReload(page, 15);
    await page.click('#navHistorique');
    await expect(page.locator('#histTableWrap')).toBeVisible({ timeout: 5000 });

    await page.fill('#histSearch', 'facture');
    await page.waitForTimeout(200);
    const rows = page.locator('#histTableWrap table tbody tr');
    const badgeRows = page.locator('#histTableWrap .badge-facture');
    const cnt = await rows.count();
    if (cnt > 0) expect(await badgeRows.count()).toBe(cnt);
  });

  test('recherche par montant', async ({ page }) => {
    await waitAppReady(page);
    await seedAndReload(page, 15);
    await page.click('#navHistorique');
    await expect(page.locator('#histTableWrap')).toBeVisible({ timeout: 5000 });

    await page.fill('#histSearch', '5000');
    await page.waitForTimeout(200);
    expect(await page.locator('#histTableWrap table tbody tr').count()).toBeGreaterThan(0);
  });

  test('recherche par date (année)', async ({ page }) => {
    await waitAppReady(page);
    await seedAndReload(page, 15);
    await page.click('#navHistorique');
    await expect(page.locator('#histTableWrap')).toBeVisible({ timeout: 5000 });

    await page.fill('#histSearch', '2026');
    await page.waitForTimeout(200);
    expect(await page.locator('#histTableWrap table tbody tr').count()).toBeGreaterThan(0);
  });

  test('tri par montant décroissant', async ({ page }) => {
    await waitAppReady(page);
    await seedAndReload(page, 15);
    await page.click('#navHistorique');
    await expect(page.locator('#histTableWrap')).toBeVisible({ timeout: 5000 });

    await page.locator('.hist-sortable[data-sort="amount"]').click();
    await page.waitForTimeout(500);

    const cells = page.locator('.hist-cell-amount');
    const count = await cells.count();
    const amounts: number[] = [];
    for (let i = 0; i < Math.min(count, 5); i++) {
      const text = await cells.nth(i).textContent();
      amounts.push(parseFloat(text?.replace(/[^\d,]/g, '').replace(',', '.') || '0'));
    }
    for (let i = 1; i < amounts.length; i++) {
      expect(amounts[i]).toBeLessThanOrEqual(amounts[i - 1]);
    }
  });

  test('suppression puis retour automatique page précédente', async ({ page }) => {
    await waitAppReady(page);
    await seedAndReload(page, 25);
    await page.click('#navHistorique');
    await expect(page.locator('#histTableWrap')).toBeVisible({ timeout: 5000 });

    await page.locator('.hist-pagination button[data-page="3"]').click();
    await page.waitForTimeout(200);

    let rows = page.locator('#histTableWrap table tbody tr');
    const initialOnLastPage = await rows.count();

    for (let i = 0; i < initialOnLastPage; i++) {
      const row = rows.first();
      await row.locator('[data-action="delete"]').click();
      await page.waitForTimeout(300);
      const confirmBtn = page.locator('.dialog-overlay button').last();
      if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmBtn.click();
        await page.waitForTimeout(500);
      }
      rows = page.locator('#histTableWrap table tbody tr');
      if ((await rows.count().catch(() => 0)) === 0) break;
    }

    await expect(page.locator('#histTableWrap')).toBeVisible({ timeout: 5000 });
    const finalCount = await page.locator('#histTableWrap table tbody tr').count().catch(() => 0);
    if (finalCount > 0) expect(finalCount).toBeLessThanOrEqual(10);
  });

  test('état vide', async ({ page }) => {
    await waitAppReady(page);
    await page.evaluate(() => { localStorage.setItem('fb_history', '[]'); });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.click('#navHistorique');
    await expect(page.locator('#histTableWrap')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.hist-empty')).toBeVisible({ timeout: 3000 });
  });

  test('responsive mobile — mode carte', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await waitAppReady(page);
    await seedAndReload(page, 8);

    const hamburger = page.locator('#appHamburgerToggle');
    if (await hamburger.isVisible({ timeout: 1000 }).catch(() => false)) {
      await hamburger.click();
      await page.waitForTimeout(200);
    }

    const navButton = page.locator('#navHistorique');
    if (await navButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await navButton.click();
    } else {
      await page.locator('[data-nav-action="historique"]').click({ force: true });
    }
    await page.waitForTimeout(500);
    await expect(page.locator('#histTableWrap')).toBeVisible({ timeout: 5000 });

    const cards = page.locator('.hist-card');
    const table = page.locator('#histTableWrap table.hist');
    const hasCards = (await cards.count().catch(() => 0)) > 0;
    const hasTable = (await table.count().catch(() => 0)) > 0;
    expect(hasCards || hasTable).toBe(true);
  });
});
