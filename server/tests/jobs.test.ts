import express from 'express';
import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ clean: vi.fn(), maintain: vi.fn(), mail: vi.fn(), configured: vi.fn(), env: { CRON_SECRET: 'a'.repeat(32) as string | undefined } }));
vi.mock('../src/config/env.js', () => ({ env: mocks.env }));
vi.mock('../src/modules/receipts/receipt.upload.js', () => ({ cleanReceiptUploads: mocks.clean }));
vi.mock('../src/modules/recurring/recurring.service.js', () => ({ runMaintenance: mocks.maintain }));
vi.mock('../src/modules/digest/digest.job.js', () => ({ runWeeklyEmails: mocks.mail }));
vi.mock('../src/modules/digest/digest.mailer.js', () => ({ weeklyEmailConfigured: mocks.configured }));
import { jobsRouter } from '../src/modules/jobs/jobs.routes.js';
const app = express(); app.use('/api/jobs', jobsRouter);
beforeEach(() => { vi.clearAllMocks(); mocks.env.CRON_SECRET = 'a'.repeat(32); mocks.configured.mockReturnValue(false); });
it('rejects absent, incorrect, and multibyte credentials before doing work', async () => {
  await request(app).get('/api/jobs/daily').expect(401);
  await request(app).get('/api/jobs/daily').set('Authorization', `Bearer ${'x'.repeat(32)}`).expect(401);
  await request(app).get('/api/jobs/daily').set('Authorization', `Bearer ${'é'.repeat(32)}`).expect(401);
  expect(mocks.clean).not.toHaveBeenCalled(); expect(mocks.maintain).not.toHaveBeenCalled(); expect(mocks.mail).not.toHaveBeenCalled();
});
it('stays closed if the secret is unconfigured', async () => {
  mocks.env.CRON_SECRET = undefined;
  await request(app).get('/api/jobs/daily').expect(401);
  expect(mocks.clean).not.toHaveBeenCalled();
});
it('runs maintenance and skips disabled mail for an authenticated scheduler', async () => {
  const result = await request(app).get('/api/jobs/daily').set('Authorization', `Bearer ${'a'.repeat(32)}`).expect(200);
  expect(result.headers['cache-control']).toBe('no-store');
  expect(mocks.clean).toHaveBeenCalledOnce(); expect(mocks.maintain).toHaveBeenCalledOnce(); expect(mocks.mail).not.toHaveBeenCalled();
});
it('runs the deduplicated weekly job when email is configured', async () => {
  mocks.configured.mockReturnValue(true); mocks.mail.mockResolvedValue({ sent: 0 });
  await request(app).get('/api/jobs/daily').set('Authorization', `Bearer ${'a'.repeat(32)}`).expect(200);
  expect(mocks.mail).toHaveBeenCalledOnce();
});
