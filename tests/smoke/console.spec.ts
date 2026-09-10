import { test, expect } from '@playwright/test';

test.describe('Console', () => {
  test('landing sans erreur SRI', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto('/', { waitUntil: 'networkidle' });
    const sriErrors = errors.filter(e => e.includes('integrity') || e.includes('digest'));
    const supabaseErrors = errors.filter(e => e.includes('supabase is not defined'));
    expect(sriErrors).toHaveLength(0);
    expect(supabaseErrors).toHaveLength(0);
  });

  test('app sans erreur supabase', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto('/app');
    await page.waitForLoadState('networkidle');
    const critical = errors.filter(e =>
      e.includes('supabase is not defined') || e.includes('Failed to find a valid digest')
    );
    expect(critical).toHaveLength(0);
  });

  test('admin sans erreur supabase', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    const critical = errors.filter(e => e.includes('supabase is not defined'));
    expect(critical).toHaveLength(0);
  });
});
