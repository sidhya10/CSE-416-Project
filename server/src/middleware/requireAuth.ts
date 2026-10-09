import type { NextFunction, Request, Response } from 'express';
import { cookieName, readSession } from '../modules/auth/auth.service.js';

export function requireAuth(request: Request, response: Response, next: NextFunction) {
  const userId = readSession(request.cookies?.[cookieName]);
  if (!userId) {
    response.status(401).json({ error: 'Authentication required' });
    return;
  }
  request.userId = userId;
  next();
}
