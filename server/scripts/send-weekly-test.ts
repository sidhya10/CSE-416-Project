// Sends one copy of the weekly email to one address right now, for testing. It ignores the Friday schedule,
// writes no send record, and needs only RESEND_API_KEY and a From address (WEEKLY_EMAIL_ENABLED is not required).
//
//   npm run weekly-email:test --workspace server -- you@example.com            your real data for this week
//   npm run weekly-email:test --workspace server -- you@example.com --sample   the wireframe's sample numbers
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { sampleDigest } from '../src/modules/digest/digest.sample.js';
import { sendViaResend, weeklyEmailFrom } from '../src/modules/digest/digest.mailer.js';
import { buildWeeklyDigest, isDigestEmpty } from '../src/modules/digest/digest.service.js';
import { digestSubject, renderDigestHtml, renderDigestText } from '../src/modules/digest/digest.template.js';

const fail = (message: string): never => { console.error(message); process.exit(1); };

async function main() {
  const [email, ...flags] = process.argv.slice(2);
  if (!email || email.startsWith('--')) fail('Usage: npm run weekly-email:test --workspace server -- you@example.com [--sample]');
  if (env.NODE_ENV === 'production') fail('The test send is disabled in production.');
  if (!env.RESEND_API_KEY || !weeklyEmailFrom()) fail('Set RESEND_API_KEY and WEEKLY_EMAIL_FROM (or PASSWORD_RESET_FROM) in .env first.');

  let digest = sampleDigest;
  if (!flags.includes('--sample')) {
    const user = await prisma.user.findFirst({ where: { email: { equals: email!, mode: 'insensitive' } }, select: { id: true } });
    if (!user) fail(`No user with the email ${email}. Register it in the app first, or add --sample.`);
    digest = await buildWeeklyDigest(user!.id);
    if (isDigestEmpty(digest)) fail('Nothing to report for this user this week, so the real email would be skipped. Add --sample to send the sample numbers.');
  }
  const options = { appOrigin: env.APP_ORIGIN.replace(/\/$/, '') };
  await sendViaResend({
    to: email!, subject: `[Test] ${digestSubject(digest)}`, html: renderDigestHtml(digest, options), text: renderDigestText(digest, options),
    idempotencyKey: `weekly-test-${randomUUID()}`,
  });
  console.log(`Sent a test email to ${email}.`);
}

main().catch(error => fail(`Test send failed: ${error instanceof Error ? error.message : String(error)}`)).finally(() => prisma.$disconnect());
