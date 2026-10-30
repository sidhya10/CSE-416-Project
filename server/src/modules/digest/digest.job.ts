import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { buildWeeklyDigest, isDigestEmpty } from './digest.service.js';
import { sendViaResend, type Mailer } from './digest.mailer.js';
import { lastScheduledSend, SEND_WINDOW_MS } from './digest.schedule.js';
import { digestSubject, renderDigestHtml, renderDigestText } from './digest.template.js';

export const BATCH_SIZE = 50;
export const MAX_ATTEMPTS = 3;
/** A failed (or stuck) send is retried once it has sat this long. */
export const RETRY_AFTER_MS = 10 * 60 * 1000;
// Resend allows about two requests a second, so sends are spaced out.
const SEND_PAUSE_MS = 600;

export type WeeklyEmailResult = { sent: number; skipped: number; failed: number; outsideWindow: boolean };
// `userIds` and `onlyEmails` narrow who is considered; `onlyEmails` replaces WEEKLY_EMAIL_ONLY, which tests must not depend on.
type Options = { now?: Date; send?: Mailer; userIds?: string[]; onlyEmails?: string[]; pauseMs?: number };

const pause = (ms: number) => ms > 0 ? new Promise<void>(resolve => setTimeout(resolve, ms)) : Promise.resolve();
const onlyEmails = () => env.WEEKLY_EMAIL_ONLY?.split(',').map(email => email.trim().toLowerCase()).filter(Boolean);

/**
 * Sends this week's email to everyone who has not had it yet, a batch at a time. Run it often: the first run
 * after Friday 10:00 Eastern starts the week and later runs finish it and retry failures. Each user is claimed
 * with a row that is unique per user and Friday, so no one is emailed twice, even across restarts or API instances.
 */
export async function runWeeklyEmails(options: Options = {}): Promise<WeeklyEmailResult> {
  const now = options.now ?? new Date();
  const send = options.send ?? sendViaResend;
  const { at, sendDate } = lastScheduledSend(now);
  const result: WeeklyEmailResult = { sent: 0, skipped: 0, failed: 0, outsideWindow: now.getTime() - at.getTime() >= SEND_WINDOW_MS };
  if (result.outsideWindow) return result;

  const date = new Date(`${sendDate}T00:00:00Z`);
  const retryBefore = new Date(now.getTime() - RETRY_AFTER_MS);
  const emails = options.onlyEmails ?? onlyEmails();
  const scope: Prisma.UserWhereInput = { ...(options.userIds ? { id: { in: options.userIds } } : {}), ...(emails ? { email: { in: emails } } : {}) };

  // Users with no row for this Friday are new work; the unique key decides who wins if two instances race.
  const fresh = await prisma.user.findMany({ where: { ...scope, weeklyEmails: { none: { sendDate: date } } }, select: { id: true, email: true }, orderBy: { id: 'asc' }, take: BATCH_SIZE });
  const claimed: { id: string; email: string; rowId: string }[] = [];
  for (const user of fresh) {
    try {
      // Rows carry the job's clock, not the database's, so the retry wait below is measured on one clock.
      const row = await prisma.weeklyEmailSend.create({ data: { userId: user.id, sendDate: date, status: 'SENDING', updatedAt: now } });
      claimed.push({ ...user, rowId: row.id });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
    }
  }
  // Failed sends, and sends a crashed instance left half-done, get another try after a wait.
  const retries = claimed.length >= BATCH_SIZE ? [] : await prisma.weeklyEmailSend.findMany({
    where: { id: { notIn: claimed.map(user => user.rowId) }, sendDate: date, status: { in: ['FAILED', 'SENDING'] }, attempts: { lt: MAX_ATTEMPTS }, updatedAt: { lt: retryBefore }, user: scope },
    select: { id: true, user: { select: { id: true, email: true } } }, take: BATCH_SIZE - claimed.length,
  });
  for (const row of retries) {
    const { count } = await prisma.weeklyEmailSend.updateMany({
      where: { id: row.id, status: { in: ['FAILED', 'SENDING'] }, updatedAt: { lt: retryBefore } }, data: { status: 'SENDING', attempts: { increment: 1 }, updatedAt: now },
    });
    if (count) claimed.push({ ...row.user, rowId: row.id });
  }

  const templateOptions = { appOrigin: env.APP_ORIGIN.replace(/\/$/, '') };
  const finish = (rowId: string, status: 'SENT' | 'SKIPPED' | 'FAILED') => prisma.weeklyEmailSend.update({ where: { id: rowId }, data: { status, updatedAt: now } });
  for (const [index, user] of claimed.entries()) {
    try {
      // The email is built as of the scheduled Friday time, so a retry later that day says the same thing.
      const digest = await buildWeeklyDigest(user.id, at);
      if (isDigestEmpty(digest)) { await finish(user.rowId, 'SKIPPED'); result.skipped++; continue; }
      await send({ to: user.email, subject: digestSubject(digest), html: renderDigestHtml(digest, templateOptions), text: renderDigestText(digest, templateOptions), idempotencyKey: `weekly-${user.id}-${sendDate}` });
      await finish(user.rowId, 'SENT'); result.sent++;
    } catch (error) {
      console.error(`Weekly email for ${user.id} failed`, error instanceof Error ? error.message : error);
      await finish(user.rowId, 'FAILED').catch(() => undefined);
      result.failed++;
    }
    if (index < claimed.length - 1) await pause(options.pauseMs ?? SEND_PAUSE_MS);
  }
  return result;
}
