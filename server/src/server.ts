import { runWeeklyEmails } from './modules/digest/digest.job.js';
import { weeklyEmailConfigured } from './modules/digest/digest.mailer.js';
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

// Weekly summary email: Fridays at 10:00 Eastern. Does nothing unless WEEKLY_EMAIL_ENABLED=true and a key and From address are set.
let weeklyEmailRunning = false;
const sendWeeklyEmails = async () => {
  if (weeklyEmailRunning) return;
  weeklyEmailRunning = true;
  try { await runWeeklyEmails(); } catch (error) { console.error('Weekly email run failed', error); }
  finally { weeklyEmailRunning = false; }
};
if (env.WEEKLY_EMAIL_ENABLED && !weeklyEmailConfigured()) console.warn('WEEKLY_EMAIL_ENABLED is true but RESEND_API_KEY or a From address (WEEKLY_EMAIL_FROM or PASSWORD_RESET_FROM) is missing; weekly email is off');
const weeklyEmailTimer = weeklyEmailConfigured() ? setInterval(() => void sendWeeklyEmails(), 60_000) : undefined;
const server = app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});

const shutdown = async (signal: string) => {
  console.log(`${signal} received; shutting down`);
  clearInterval(maintenanceTimer);
  if (weeklyEmailTimer) clearInterval(weeklyEmailTimer);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on('SIGINT', () => { void shutdown('SIGINT'); });
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
