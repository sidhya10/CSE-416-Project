import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/database.js';
import { clearSession, cookieName, readSessionClaims } from '../modules/auth/auth.service.js';

export async function requireAuth(request: Request, response: Response, next: NextFunction) {
  const session = readSessionClaims(request.cookies?.[cookieName]);
  if (!session) {
    response.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { sessionVersion: true } });
    if (!user || user.sessionVersion !== session.sessionVersion) {
      clearSession(response);
      response.status(401).json({ error: 'Your session expired. Sign in again.' });
      return;
    }
    request.userId = session.userId;
    next();
  } catch (error) { next(error); }
}
