import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { MAX_ATTEMPTS, RETRY_AFTER_MS, runWeeklyEmails } from '../src/modules/digest/digest.job.js';
import { lastScheduledSend, SEND_WINDOW_MS } from '../src/modules/digest/digest.schedule.js';
import type { Mail } from '../src/modules/digest/digest.mailer.js';

const run = randomUUID().replaceAll('-', '').slice(0, 16);
const userIds: string[] = [], emails: string[] = [];
let withAlert: string, quiet: string, flaky: string;

// A Friday late in the century, clear of every other test's data. 16:00 UTC is after 10:00 in New York all year.
const newYorkWeekday = (date: Date) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(date);
const friday = Array.from({ length: 7 }, (_, index) => new Date(Date.UTC(2090, 0, 1 + index, 16))).find(date => newYorkWeekday(date) === 'Fri')!;
const { at, sendDate } = lastScheduledSend(friday);

beforeAll(async () => {
  for (const index of [0, 1, 2]) {
    const result = await request(app).post('/api/auth/register').send({ name: `Weekly ${index} Tester`, username: `wk_${run}_${index}`, email: `wk_${run}_${index}@example.com`, phone: `+1211${String(Date.now() + index).slice(-7)}`, password: 'password1' }).expect(201);
    userIds.push(result.body.user.id); emails.push(`wk_${run}_${index}@example.com`);
  }
  [withAlert, quiet, flaky] = userIds as [string, string, string];
  // A connection that needs re-authentication gives a user something to report; the quiet user has nothing.
  for (const [index, userId] of [withAlert, flaky].entries()) {
    await prisma.bankConnection.create({ data: { userId, plaidItemId: `weekly-${run}-${index}`, institutionName: 'Test Bank', accessTokenEnc: 'not-a-real-token', status: 'NEEDS_ATTENTION' } });
  }
});

afterAll(async () => {
  // Send records, connections and the rest are deleted with their user.
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe('weekly email job', () => {
  const sent: Mail[] = [];
  let failFlaky = true;
  const send = async (mail: Mail) => {
    sent.push(mail);
    if (failFlaky && mail.to === emails[2]) throw new Error('provider down');
  };
  const run1 = (now: Date) => runWeeklyEmails({ now, send, userIds, onlyEmails: emails, pauseMs: 0 });

  it('sends to users with something to report, skips the rest, and records a failure', async () => {
    expect(at.getTime()).toBeLessThan(friday.getTime());
    const result = await run1(friday);
    expect(result).toEqual({ sent: 1, skipped: 1, failed: 1, outsideWindow: false });
    const mail = sent.find(item => item.to === emails[0])!;
    expect(mail).toMatchObject({ to: emails[0], idempotencyKey: `weekly-${withAlert}-${sendDate}` });
    expect(mail.subject).toBe('Your week in Divvy');
    expect(mail.html).toContain('Hi Weekly,');
    expect(mail.html).toContain('Bank connection needs re-authentication');
    expect(mail.text).toContain('Open Divvy: ');
    expect(sent.some(item => item.to === emails[1])).toBe(false);
    const rows = await prisma.weeklyEmailSend.findMany({ where: { userId: { in: userIds } }, orderBy: { userId: 'asc' } });
    expect(Object.fromEntries(rows.map(row => [row.userId, row.status]))).toEqual({ [withAlert]: 'SENT', [quiet]: 'SKIPPED', [flaky]: 'FAILED' });
  });

  it('does not send anything twice when it runs again straight away', async () => {
    const before = sent.length;
    expect(await run1(new Date(friday.getTime() + 60_000))).toEqual({ sent: 0, skipped: 0, failed: 0, outsideWindow: false });
    expect(sent).toHaveLength(before);
  });

  it('retries a failed send after the wait, then stops after the attempt limit', async () => {
    failFlaky = false;
    const later = new Date(friday.getTime() + RETRY_AFTER_MS + 60_000);
    expect(await run1(later)).toEqual({ sent: 1, skipped: 0, failed: 0, outsideWindow: false });
    expect(sent.filter(item => item.to === emails[2])).toHaveLength(2);
    expect(await prisma.weeklyEmailSend.findUniqueOrThrow({ where: { userId_sendDate: { userId: flaky, sendDate: new Date(`${sendDate}T00:00:00Z`) } } })).toMatchObject({ status: 'SENT', attempts: 2 });
  });

  it('gives up on a user after the attempt limit', async () => {
    const date = new Date(`${sendDate}T00:00:00Z`);
    await prisma.weeklyEmailSend.update({ where: { userId_sendDate: { userId: flaky, sendDate: date } }, data: { status: 'FAILED', attempts: MAX_ATTEMPTS } });
    const before = sent.length;
    expect(await run1(new Date(friday.getTime() + 2 * RETRY_AFTER_MS + 120_000))).toMatchObject({ sent: 0, failed: 0 });
    expect(sent).toHaveLength(before);
  });

  it('sends nothing once the window has closed', async () => {
    const before = sent.length;
    expect(await run1(new Date(at.getTime() + SEND_WINDOW_MS + 1000))).toEqual({ sent: 0, skipped: 0, failed: 0, outsideWindow: true });
    expect(sent).toHaveLength(before);
  });

  it('claims each user only once when two runs race', async () => {
    await prisma.weeklyEmailSend.deleteMany({ where: { userId: { in: userIds } } });
    failFlaky = false;
    const before = sent.length;
    const [a, b] = await Promise.all([run1(friday), run1(friday)]);
    expect(a.sent + b.sent).toBe(2);
    expect(a.skipped + b.skipped).toBe(1);
    expect(sent.length - before).toBe(2);
  });
});
