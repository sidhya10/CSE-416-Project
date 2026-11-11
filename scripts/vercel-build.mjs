import { spawnSync } from 'node:child_process';

const commands = [['run', 'prisma:generate']];
// Preview builds must never migrate the production database.
if (process.env.VERCEL_ENV === 'production') commands.push(['exec', '--', 'prisma', 'migrate', 'deploy']);
commands.push(['run', 'build', '--workspace', 'shared'], ['run', 'build', '--workspace', 'client']);
for (const args of commands) {
  const result = spawnSync('npm', args, { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
