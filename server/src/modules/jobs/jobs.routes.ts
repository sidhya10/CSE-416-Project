import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { env } from '../../config/env.js';
import { runMaintenance } from '../recurring/recurring.service.js';
import { runWeeklyEmails } from '../digest/digest.job.js';
import { weeklyEmailConfigured } from '../digest/digest.mailer.js';
import { cleanReceiptUploads } from '../receipts/receipt.upload.js';

export const jobsRouter = Router();
jobsRouter.get('/daily', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const expected = env.CRON_SECRET ? `Bearer ${env.CRON_SECRET}` : '';
  const actual = req.get('authorization') ?? '';
  if (!expected || Buffer.byteLength(actual) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) {
    res.status(401).json({ error: 'Authentication required' }); return;
  }
  await cleanReceiptUploads();
  await runMaintenance();
  const weekly = weeklyEmailConfigured() ? await runWeeklyEmails() : { disabled: true };
  res.json({ ok: true, weekly });
});
