import { clearGoogleAttempt, readGoogleAttempt, startGoogleAttempt } from './google-attempt.js';
import { Prisma } from '@prisma/client';
import { Router, type Request } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { presentUser } from '../users/user.presenter.js';
import { clearSession, cookieName, hashPassword, readSessionClaims, setSession, verifyPassword } from './auth.service.js';
import { findUserByIdentifier, phoneSchema } from './identity.js';
import { hashPasswordResetToken, newPasswordResetToken, passwordResetTtlMs, sendPasswordResetEmail } from './password-reset.js';
import { hashRecoveryCode, newRecoveryCodes } from './recovery-code.js';
import { syncAll as syncBankTransactions } from '../banking/bank.service.js';

export const authRouter = Router();

const accountSchema = z.object({
  email: z.email().transform(value => value.toLowerCase()),
  username: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_]+$/).transform(value => value.toLowerCase()),
  password: z.string().min(8).regex(/[0-9]/, 'Password must contain a number'),
  name: z.string().trim().min(1).max(80),
  phone: phoneSchema,
});
const loginSchema = z.object({ identifier: z.string().trim().min(1).max(254), password: z.string().min(1) });
const googleSchema = z.object({ credential: z.string().min(1).max(20000), state: z.string().length(64), phone: phoneSchema.optional() });

const validationError = (issues: { message: string }[]) => ({ error: 'Invalid request', details: issues.map(issue => issue.message) });
const conflictMessage = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
// A provider outage must never block account access; successful logins still attempt a complete incremental pull.
const syncBanksAfterLogin = async (userId: string) => { await syncBankTransactions(userId).catch(() => undefined); };
const validCurrentSession = async (request: Request) => {
  const session = readSessionClaims(request.cookies?.[cookieName]);
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { sessionVersion: true } });
  return user?.sessionVersion === session.sessionVersion ? session.userId : null;
};

authRouter.post('/register', async (request, response, next) => {
  const parsed = accountSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json(validationError(parsed.error.issues));
  try {
    const { password, ...data } = parsed.data;
    const user = await prisma.user.create({ data: { ...data, passwordHash: await hashPassword(password) } });
    setSession(response, user.id, user.sessionVersion);
    return response.status(201).json({ user: presentUser(user) });
  } catch (error) {
    if (conflictMessage(error)) return response.status(409).json({ error: 'That email, username, or phone number is already in use' });
    next(error);
  }
});

authRouter.post('/login', async (request, response, next) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json(validationError(parsed.error.issues));
  try {
    const user = await findUserByIdentifier(parsed.data.identifier);
    if (!user?.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return response.status(401).json({ error: 'Username, email, phone number, or password is incorrect' });
    }
    setSession(response, user.id, user.sessionVersion);
    await syncBanksAfterLogin(user.id);
    return response.json({ user: presentUser(user) });
  } catch (error) { next(error); }
});

authRouter.post('/google/start', async (request, response) => {
  if (!env.GOOGLE_CLIENT_ID) return response.status(503).json({ error: 'Google sign-in is not configured on the server. Set GOOGLE_CLIENT_ID and restart the app.' });
  const parsed = z.object({ nonce: z.string().min(32).max(128).regex(/^[A-Za-z0-9_-]+$/), intent: z.enum(['signin', 'signup', 'link', 'recover']) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json(validationError(parsed.error.issues));
  const userId = await validCurrentSession(request);
  if (parsed.data.intent === 'link' && !userId) return response.status(401).json({ error: 'Sign in before connecting a Google account' });
  return response.json(startGoogleAttempt(response, parsed.data.nonce, parsed.data.intent, parsed.data.intent === 'link' ? userId : null));
});

// The same verified identity endpoint supports sign-in, sign-up, and explicit linking.
// Linking always targets the authenticated user and requires an exact email match.
for (const intent of ['signin', 'link', 'recover'] as const) {
  authRouter.post(intent === 'link' ? '/google/link' : intent === 'recover' ? '/google/recover' : '/google', async (request, response, next) => {
    if (!env.GOOGLE_CLIENT_ID) return response.status(503).json({ error: 'Google sign-in is not configured on the server' });
    if (intent === 'link' && !await validCurrentSession(request)) return response.status(401).json({ error: 'Sign in before connecting a Google account' });
    const parsed = googleSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json(validationError(parsed.error.issues));
    const attempt = readGoogleAttempt(request, parsed.data.state, intent === 'link' ? 'link' : intent === 'recover' ? 'recover' : ['signin', 'signup']);
    if (!attempt) return response.status(401).json({ error: 'Google sign-in expired or your session changed. Try again.' });
    try {
      let payload;
      try {
        const ticket = await new OAuth2Client(env.GOOGLE_CLIENT_ID).verifyIdToken({ idToken: parsed.data.credential, audience: env.GOOGLE_CLIENT_ID });
        payload = ticket.getPayload();
      } catch { return response.status(401).json({ error: 'Google sign-in token is invalid or expired. Try again.' }); }
      if (!payload?.sub || !payload.email || payload.email_verified !== true || payload.nonce !== attempt.nonce) return response.status(401).json({ error: 'Google could not verify this sign-in. Try again.' });
      const email = payload.email.toLowerCase();
      const [bySubject, byEmail] = await Promise.all([
        prisma.user.findUnique({ where: { googleSubject: payload.sub } }),
        prisma.user.findUnique({ where: { email } }),
      ]);
      let user;
      if (intent === 'recover') {
        user = bySubject;
        if (!user || user.email.toLowerCase() !== email || byEmail?.id !== user.id) return response.status(404).json({ error: 'No account has this Google identity connected. Use a saved recovery code or sign in normally.' });
        const resetToken = newPasswordResetToken();
        await prisma.$transaction([
          prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
          prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashPasswordResetToken(resetToken), expiresAt: new Date(Date.now() + 10 * 60 * 1000) } }),
        ]);
        clearGoogleAttempt(response);
        response.set('Cache-Control', 'no-store');
        return response.json({ resetToken });
      } else if (intent === 'link') {
        user = await prisma.user.findUnique({ where: { id: attempt.userId! } });
        if (!user) { clearSession(response); return response.status(401).json({ error: 'Account no longer exists' }); }
        if (email !== user.email.toLowerCase()) return response.status(409).json({ error: `Email mismatch: this app account uses ${user.email}, but the selected Google account uses ${email}. Choose the Google account with the same email.` });
        if (bySubject && bySubject.id !== user.id || byEmail && byEmail.id !== user.id) return response.status(409).json({ error: 'That Google account is already associated with another account. Sign in to that account instead.' });
        if (user.googleSubject && user.googleSubject !== payload.sub) return response.status(409).json({ error: 'A different Google account is already connected' });
      } else {
        user = bySubject ?? byEmail;
        if (!user && attempt.intent === 'signin') return response.status(404).json({ error: 'No account uses that Google email. Create an account first.' });
        if (user?.googleSubject && user.googleSubject !== payload.sub) return response.status(409).json({ error: 'That email belongs to another Google account' });
        // Google is authoritative for Gmail and Workspace emails, not third-party email ownership.
        if (user && !user.googleSubject && !email.endsWith('@gmail.com') && !payload.hd) return response.status(409).json({ error: 'Sign in with your password first, then connect Google in Account settings.' });
      }
      if (user && !user.googleSubject) {
        const updated = await prisma.user.updateMany({ where: { id: user.id, googleSubject: null }, data: { googleSubject: payload.sub, photoUrl: user.photoUrl ?? payload.picture } });
        if (!updated.count) return response.status(409).json({ error: 'Account connection changed. Refresh and try again.' });
        user = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      } else if (!user) {
        if (!parsed.data.phone) return response.status(400).json({ error: 'A phone number is required to create an account.' });
        const base = (email.split('@')[0] ?? 'user').replace(/[^A-Za-z0-9_]/g, '').slice(0, 24).toLowerCase() || 'user';
        let username = base;
        for (let suffix = 1; await prisma.user.findUnique({ where: { username } }); suffix += 1) username = `${base}${suffix}`;
        user = await prisma.user.create({ data: { email, username, name: payload.name?.trim() || username, phone: parsed.data.phone, googleSubject: payload.sub, photoUrl: payload.picture } });
      }
      clearGoogleAttempt(response);
      setSession(response, user.id, user.sessionVersion);
      if (intent === 'signin' && attempt.intent === 'signin') await syncBanksAfterLogin(user.id);
      return response.json({ user: presentUser(user) });
    } catch (error) {
      if (conflictMessage(error)) return response.status(409).json({ error: 'That Google account is already connected or the account was just created. Try signing in again.' });
      next(error);
    }
  });
}

authRouter.get('/me', requireAuth, async (request, response, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: request.userId! } });
    if (!user) { clearSession(response); return response.status(401).json({ error: 'Account no longer exists' }); }
    return response.json({ user: presentUser(user) });
  } catch (error) { next(error); }
});

const forgotPasswordSchema = z.object({ identifier: z.string().trim().min(1).max(254) }).strict();
authRouter.post('/forgot-password', async (request, response, next) => {
  const parsed = forgotPasswordSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json(validationError(parsed.error.issues));
  try {
    const user = await findUserByIdentifier(parsed.data.identifier);
    let resetToken: string | undefined;
    if (user?.passwordHash) {
      resetToken = newPasswordResetToken();
      await prisma.$transaction([
        prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
        prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashPasswordResetToken(resetToken), expiresAt: new Date(Date.now() + passwordResetTtlMs) } }),
      ]);
      try { await sendPasswordResetEmail({ email: user.email, name: user.name, token: resetToken }); }
      catch (error) { console.error('Could not send password reset email', error); await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }); }
    }
    return response.status(202).json({ message: 'If an account matches, a password reset link has been sent.', ...(env.NODE_ENV === 'test' && resetToken ? { resetToken } : {}) });
  } catch (error) { next(error); }
});

const recoveryCodeGenerationSchema = z.object({ currentPassword: z.string().max(1024).optional() }).strict();
authRouter.post('/recovery-codes', requireAuth, async (request, response, next) => {
  const parsed = recoveryCodeGenerationSchema.safeParse(request.body ?? {});
  if (!parsed.success) return response.status(400).json(validationError(parsed.error.issues));
  try {
    const user = await prisma.user.findUnique({ where: { id: request.userId! } });
    if (!user) { clearSession(response); return response.status(401).json({ error: 'Account no longer exists' }); }
    if (user.passwordHash && (!parsed.data.currentPassword || !await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
      return response.status(403).json({ error: 'Current password is incorrect' });
    }
    const codes = newRecoveryCodes();
    await prisma.$transaction([
      prisma.recoveryCode.deleteMany({ where: { userId: user.id } }),
      prisma.recoveryCode.createMany({ data: codes.map(code => ({ userId: user.id, codeHash: hashRecoveryCode(code) })) }),
    ]);
    response.set('Cache-Control', 'no-store');
    return response.json({ codes });
  } catch (error) { next(error); }
});

const recoveryAttempts = new Map<string, { count: number; resetsAt: number }>();
const allowRecoveryAttempt = (key: string) => {
  const now = Date.now();
  const previous = recoveryAttempts.get(key);
  const entry = !previous || previous.resetsAt <= now ? { count: 0, resetsAt: now + 15 * 60 * 1000 } : previous;
  entry.count += 1;
  recoveryAttempts.set(key, entry);
  return entry.count <= 5;
};
const recoveryResetSchema = z.object({
  identifier: z.string().trim().min(1).max(254),
  code: z.string().trim().min(16).max(40),
  newPassword: z.string().min(8, 'Use at least 8 characters').max(72).regex(/[0-9]/, 'Password must contain a number')
    .refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 bytes'),
  confirmPassword: z.string().min(1).max(72),
}).strict().refine(value => value.newPassword === value.confirmPassword, 'New passwords do not match');

authRouter.post('/recovery-code/reset', async (request, response, next) => {
  const parsed = recoveryResetSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid recovery request' });
  const attemptKey = `${request.ip ?? 'unknown'}:${parsed.data.identifier.toLowerCase()}`;
  if (!allowRecoveryAttempt(attemptKey)) return response.status(429).json({ error: 'Too many recovery attempts. Try again in 15 minutes.' });
  try {
    const user = await findUserByIdentifier(parsed.data.identifier);
    if (!user) return response.status(400).json({ error: 'The recovery code is invalid or has already been used.' });
    const codeHash = hashRecoveryCode(parsed.data.code);
    const passwordHash = await hashPassword(parsed.data.newPassword);
    const recovered = await prisma.$transaction(async tx => {
      const claimed = await tx.recoveryCode.deleteMany({ where: { userId: user.id, codeHash } });
      if (!claimed.count) return null;
      await tx.recoveryCode.deleteMany({ where: { userId: user.id } });
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
      return tx.user.update({ where: { id: user.id }, data: { passwordHash, sessionVersion: { increment: 1 } } });
    });
    if (!recovered) return response.status(400).json({ error: 'The recovery code is invalid or has already been used.' });
    clearSession(response);
    return response.json({ message: 'Password reset successfully. Sign in with your new password.' });
  } catch (error) { next(error); }
});

const resetPasswordSchema = z.object({
  token: z.string().min(32).max(200),
  newPassword: z.string().min(8, 'Use at least 8 characters').max(72).regex(/[0-9]/, 'Password must contain a number')
    .refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 bytes'),
  confirmPassword: z.string().min(1).max(72),
}).strict().refine(value => value.newPassword === value.confirmPassword, 'New passwords do not match');

authRouter.post('/reset-password', async (request, response, next) => {
  const parsed = resetPasswordSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid password reset' });
  try {
    const tokenHash = hashPasswordResetToken(parsed.data.token);
    const passwordHash = await hashPassword(parsed.data.newPassword);
    const user = await prisma.$transaction(async tx => {
      const reset = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
      if (!reset || reset.usedAt || reset.expiresAt <= new Date()) return null;
      const claimed = await tx.passwordResetToken.updateMany({ where: { id: reset.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
      if (!claimed.count) return null;
      await tx.passwordResetToken.deleteMany({ where: { userId: reset.userId, id: { not: reset.id } } });
      await tx.recoveryCode.deleteMany({ where: { userId: reset.userId } });
      return tx.user.update({ where: { id: reset.userId }, data: { passwordHash, sessionVersion: { increment: 1 } } });
    });
    if (!user) return response.status(400).json({ error: 'This password reset link is invalid or has expired.' });
    setSession(response, user.id, user.sessionVersion);
    return response.json({ user: presentUser(user) });
  } catch (error) { next(error); }
});

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(8, 'Use at least 8 characters').max(72)
    .regex(/[0-9]/, 'Password must contain a number')
    .refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 bytes'),
  confirmPassword: z.string().min(1).max(72),
}).strict().refine(value => value.newPassword === value.confirmPassword, 'New passwords do not match')
  .refine(value => value.newPassword !== value.currentPassword, 'Choose a different new password');

authRouter.post('/password', requireAuth, async (request, response, next) => {
  const parsed = passwordChangeSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid password change' });
  try {
    const user = await prisma.user.findUnique({ where: { id: request.userId! } });
    if (!user) { clearSession(response); return response.status(401).json({ error: 'Account no longer exists' }); }
    if (!user.passwordHash) return response.status(400).json({ error: 'This account uses Google sign-in. Manage your password through Google.' });
    if (!(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) return response.status(403).json({ error: 'Current password is incorrect' });
    // Compare-and-swap prevents two simultaneous requests from replacing a newer password.
    const updated = await prisma.user.updateMany({
      where: { id: user.id, passwordHash: user.passwordHash },
      data: { passwordHash: await hashPassword(parsed.data.newPassword), sessionVersion: { increment: 1 } },
    });
    if (!updated.count) return response.status(409).json({ error: 'Password was changed by another request. Sign in again and retry.' });
    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    setSession(response, refreshed.id, refreshed.sessionVersion);
    return response.status(204).end();
  } catch (error) { next(error); }
});

authRouter.post('/logout', (_request, response) => { clearSession(response); response.status(204).end(); });
