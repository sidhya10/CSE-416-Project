import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { presentUser } from '../users/user.presenter.js';
import { clearSession, hashPassword, setSession, verifyPassword } from './auth.service.js';

export const authRouter = Router();

const accountSchema = z.object({
  email: z.email().transform(value => value.toLowerCase()),
  username: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_]+$/).transform(value => value.toLowerCase()),
  password: z.string().min(8).regex(/[0-9]/, 'Password must contain a number'),
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(7).max(24).optional().or(z.literal('')).transform(value => value || undefined),
});
const loginSchema = z.object({ email: z.email().transform(value => value.toLowerCase()), password: z.string().min(1) });
const googleSchema = z.object({ credential: z.string().min(1) });

const validationError = (issues: { message: string }[]) => ({ error: 'Invalid request', details: issues.map(issue => issue.message) });
const conflictMessage = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

authRouter.post('/register', async (request, response, next) => {
  const parsed = accountSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json(validationError(parsed.error.issues));
  try {
    const { password, ...data } = parsed.data;
    const user = await prisma.user.create({ data: { ...data, passwordHash: await hashPassword(password) } });
    setSession(response, user.id);
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
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (!user?.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return response.status(401).json({ error: 'Email or password is incorrect' });
    }
    setSession(response, user.id);
    return response.json({ user: presentUser(user) });
  } catch (error) { next(error); }
});

authRouter.post('/google', async (request, response, next) => {
  if (!env.GOOGLE_CLIENT_ID) return response.status(503).json({ error: 'Google sign-in is not configured yet' });
  const parsed = googleSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json(validationError(parsed.error.issues));
  try {
    const ticket = await new OAuth2Client(env.GOOGLE_CLIENT_ID).verifyIdToken({ idToken: parsed.data.credential, audience: env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || payload.email_verified !== true) return response.status(401).json({ error: 'Google could not verify this account' });
    const email = payload.email.toLowerCase();
    let user = await prisma.user.findFirst({ where: { OR: [{ googleSubject: payload.sub }, { email }] } });
    if (user) {
      if (user.googleSubject && user.googleSubject !== payload.sub) return response.status(409).json({ error: 'That email belongs to another Google account' });
      if (!user.googleSubject) user = await prisma.user.update({ where: { id: user.id }, data: { googleSubject: payload.sub, photoUrl: user.photoUrl ?? payload.picture } });
    } else {
      const base = (email.split('@')[0] ?? 'user').replace(/[^A-Za-z0-9_]/g, '').slice(0, 24).toLowerCase() || 'user';
      let username = base;
      for (let suffix = 1; await prisma.user.findUnique({ where: { username } }); suffix += 1) username = `${base.slice(0, 24)}${suffix}`;
      user = await prisma.user.create({ data: { email, username, name: payload.name?.trim() || username, googleSubject: payload.sub, photoUrl: payload.picture } });
    }
    setSession(response, user.id);
    return response.json({ user: presentUser(user) });
  } catch (error) {
    if (error instanceof Error && /token|audience|issuer|signature/i.test(error.message)) return response.status(401).json({ error: 'Google sign-in token is invalid or expired' });
    next(error);
  }
});

authRouter.get('/me', requireAuth, async (request, response, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: request.userId! } });
    if (!user) { clearSession(response); return response.status(401).json({ error: 'Account no longer exists' }); }
    return response.json({ user: presentUser(user) });
  } catch (error) { next(error); }
});

authRouter.post('/logout', (_request, response) => { clearSession(response); response.status(204).end(); });
