import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import { env } from '../../config/env.js';

const cookieName = 'cse416_session';

export const hashPassword = (password: string) => bcrypt.hash(password, 12);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

export function setSession(response: Response, userId: string) {
  const token = jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: '7d' });
  response.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSession(response: Response) {
  response.clearCookie(cookieName, { httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production', path: '/' });
}

export function readSession(token?: string) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    return typeof payload === 'object' && typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export { cookieName };
