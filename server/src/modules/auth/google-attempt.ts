import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { cookieName, readSession } from './auth.service.js';

const attemptCookie = 'cse416_google_attempt';
const audience = 'cse416-google-popup';
const options = { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/api/auth/google' };
const attemptSchema = z.object({ nonce: z.string(), state: z.string(), intent: z.enum(['signin', 'link']), userId: z.string().nullable() });
export const currentSession = (request: Request) => readSession(request.cookies?.[cookieName]);

export function startGoogleAttempt(response: Response, nonce: string, intent: 'signin' | 'link', userId: string | null) {
  const attempt = { nonce, state: randomBytes(32).toString('hex'), intent, userId };
  response.cookie(attemptCookie, jwt.sign(attempt, env.JWT_SECRET, { audience, expiresIn: '10m' }), { ...options, maxAge: 10 * 60 * 1000 });
  response.set('Cache-Control', 'no-store');
  return { clientId: env.GOOGLE_CLIENT_ID!, nonce, state: attempt.state };
}

export function readGoogleAttempt(request: Request, state: string, intent: 'signin' | 'link') {
  try {
    const parsed = attemptSchema.safeParse(jwt.verify(request.cookies?.[attemptCookie] ?? '', env.JWT_SECRET, { audience }));
    if (!parsed.success || parsed.data.state !== state || parsed.data.intent !== intent || parsed.data.userId !== currentSession(request)) return null;
    return parsed.data;
  } catch { return null; }
}

export function clearGoogleAttempt(response: Response) { response.clearCookie(attemptCookie, options); }
