import { env } from '../../config/env.js';

export type Mail = { to: string; subject: string; html: string; text: string; idempotencyKey: string };
export type Mailer = (mail: Mail) => Promise<void>;

export const weeklyEmailFrom = () => env.WEEKLY_EMAIL_FROM ?? env.PASSWORD_RESET_FROM;
/** The weekly email runs only when it is switched on and there is a key and a verified From address to send with. */
export const weeklyEmailConfigured = () => env.WEEKLY_EMAIL_ENABLED && !!env.RESEND_API_KEY && !!weeklyEmailFrom();

/** Sends one email through Resend. The idempotency key makes a repeated request for the same email a no-op. */
export const sendViaResend: Mailer = async mail => {
  const from = weeklyEmailFrom();
  if (!env.RESEND_API_KEY || !from) throw new Error('Weekly email is not configured');
  const replyTo = env.WEEKLY_EMAIL_REPLY_TO ?? env.PASSWORD_RESET_REPLY_TO;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': mail.idempotencyKey },
    body: JSON.stringify({ from, ...(replyTo ? { reply_to: replyTo } : {}), to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text }),
  });
  if (!response.ok) {
    const requestId = response.headers.get('x-resend-id') ?? response.headers.get('request-id');
    throw new Error(`Weekly email failed with status ${response.status}${requestId ? ` (${requestId})` : ''}`);
  }
};
