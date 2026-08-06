import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const AUTH_FILE = path.join(__dirname, '.auth', 'user.json');

export default defineConfig({
  testDir: '.',
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  retries: 0,
  workers: 4,
  reporter: [
    ['html', { outputFolder: '../test-results/html-report', open: 'never' }],
    ['json', { outputFile: '../test-results/results.json' }],
    ['list'],
  ],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10000,
  },
  projects: [
    // Étape 1 : authentification une seule fois
    {
      name: 'setup',
      testMatch: 'auth.setup.ts',
      timeout: 60000,
    },
    // Étape 2 : tests authentifiés
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        storageState: AUTH_FILE,
      },
      dependencies: ['setup'],
      testIgnore: [
        'auth.setup.ts',
        '**/landing.spec.ts',
        '**/seo-landing.spec.ts',
      ],
    },
    // Étape 3 : tests non authentifiés
    {
      name: 'chromium-guest',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
      testMatch: ['**/landing.spec.ts', '**/seo-landing.spec.ts'],
    },
  ],
  webServer: {
    command: 'node server.js',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 30000,
    cwd: '..',
  },
});
