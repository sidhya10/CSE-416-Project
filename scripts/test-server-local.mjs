import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

const root = fileURLToPath(new URL('../', import.meta.url));
const settings = parse(readFileSync(new URL('../.env.test', import.meta.url)));
const database = new URL(settings.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(database.hostname) || database.pathname !== '/cse416_test') {
  throw new Error('Local backend tests require the separate local cse416_test database.');
}
const env = { ...process.env, ...settings, NODE_ENV: 'test' };
for (const args of [
  ['prisma', 'generate'],
  ['prisma', 'migrate', 'deploy'],
  ['vitest', 'run', '--root', 'server'],
]) {
  const result = spawnSync('npx', args, { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
