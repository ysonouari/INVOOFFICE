import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';

const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.1';
const SUPABASE_SRI =
  'sha384-ZM8CwwQOJp5puchJk/gzqVbkGOUMVxHQPIY7mDCclfX3C8u6+ZyCjOcwaMC8hbnQ';

const PAGES = [
  { name: 'app', route: '/app', defer: true },
  { name: 'admin', route: '/admin', defer: true },
  { name: 'landing', route: '/', defer: true },
  { name: 'confirmation', route: '/confirmation', defer: false },
];

test.describe('B2 — SRI supabase-js', () => {
  for (const p of PAGES) {
    test(`${p.name} : script supabase-js protégé par SRI`, async ({ request }) => {
      const resp = await request.get(p.route);
      expect(resp.ok()).toBe(true);
      const html = await resp.text();

      const expected = `<script src="${SUPABASE_CDN_URL}" integrity="${SUPABASE_SRI}" crossorigin="anonymous"${p.defer ? ' defer' : ''}></script>`;
      expect(html).toContain(expected);
      expect(html.split(`src="${SUPABASE_CDN_URL}"`).length - 1).toBe(1);
    });
  }

  test('le hash SRI correspond aux octets réellement servis par le CDN', async ({ request }) => {
    const resp = await request.get(SUPABASE_CDN_URL);
    expect(resp.ok()).toBe(true);
    const contentType = resp.headers()['content-type'] || '';
    expect(contentType).toContain('javascript');

    const bytes = Buffer.from(await resp.body());
    expect(bytes.byteLength).toBeGreaterThan(100000);

    const actual = createHash('sha384').update(bytes).digest('base64');
    expect(`sha384-${actual}`).toBe(SUPABASE_SRI);

    const text = bytes.toString('utf8');
    expect(text).toContain('createClient');
  });
});