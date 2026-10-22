import { createHash, randomBytes } from 'node:crypto';
import { env } from '../../config/env.js';

export const passwordResetTtlMs = 30 * 60 * 1000;
export const newPasswordResetToken = () => randomBytes(32).toString('base64url');
export const hashPasswordResetToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function sendPasswordResetEmail(input: { email: string; name: string; token: string }) {
  const resetUrl = `${env.APP_ORIGIN.replace(/\/$/, '')}/?reset=${encodeURIComponent(input.token)}`;
  if (!env.RESEND_API_KEY || !env.PASSWORD_RESET_FROM) {
    if (env.NODE_ENV !== 'production') console.info(`Password reset for ${input.email}: ${resetUrl}`);
    return { delivered: false, resetUrl };
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.PASSWORD_RESET_FROM,
      to: [input.email],
      subject: 'Reset your password',
      text: `Hi ${input.name},\n\nUse this link within 30 minutes to reset your password:\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
    }),
  });
  if (!response.ok) throw new Error(`Password reset email failed with status ${response.status}`);
  return { delivered: true, resetUrl };
}
