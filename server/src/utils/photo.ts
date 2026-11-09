import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';

/** Photos are fetched separately from financial records and cached privately by the browser. */
export function sendPhoto(req: Request, res: Response, photo: string | null, name: string) {
  res.vary('Cookie');
  if (photo?.startsWith('https://')) { res.setHeader('Cache-Control', 'private, max-age=3600'); res.redirect(photo); return; }
  const match = /^data:(image\/(?:png|jpeg|webp|gif|avif));base64,([A-Za-z0-9+/=\s]+)$/.exec(photo ?? '');
  const letter = (name.trim().charAt(0).toUpperCase() || '?').replace(/[<>&"']/g, '');
  const data = match ? Buffer.from(match[2]!, 'base64') : Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" rx="40" fill="#dcebe3"/><text x="40" y="51" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#254638">${letter}</text></svg>`);
  const etag = `"${createHash('sha256').update(data).digest('hex')}"`;
  res.setHeader('Cache-Control', 'private, max-age=3600'); res.setHeader('ETag', etag);
  if (req.headers['if-none-match'] === etag) { res.status(304).end(); return; }
  res.type(match ? match[1]! : 'image/svg+xml').send(data);
}
