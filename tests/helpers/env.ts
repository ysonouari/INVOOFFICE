import fs from 'fs';
import path from 'path';

const ENV_FILE = path.join(__dirname, '..', '..', '.env.local');

function loadEnvFile(): void {
  if (!fs.existsSync(ENV_FILE)) return;
  const content = fs.readFileSync(ENV_FILE, 'utf8').replace(/^\uFEFF/, '');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const withoutExport = line.replace(/^export\s+/, '');
    const separator = withoutExport.indexOf('=');
    if (separator === -1) continue;
    const key = withoutExport.slice(0, separator).trim();
    if (!key) continue;
    let value = withoutExport.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();

export function requireTestUser(): { email: string; password: string } {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'TEST_USER_EMAIL / TEST_USER_PASSWORD manquants dans .env.local'
    );
  }
  return { email, password };
}
