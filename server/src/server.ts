import { runMaintenance } from './modules/recurring/recurring.service.js';
import { app } from './app.js';
import { prisma } from './config/database.js';
import { env } from './config/env.js';

let maintenanceRunning = false;
const maintain = async () => {
  if (maintenanceRunning) return;
  maintenanceRunning = true;
  try { await runMaintenance(); } catch (error) { console.error('Scheduled maintenance failed', error); }
  finally { maintenanceRunning = false; }
};
void maintain();
const maintenanceTimer = setInterval(() => void maintain(), 60_000);
const server = app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});

const shutdown = async (signal: string) => {
  console.log(`${signal} received; shutting down`);
  clearInterval(maintenanceTimer);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on('SIGINT', () => { void shutdown('SIGINT'); });
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
