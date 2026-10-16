import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../../config/env.js';

const key = () => createHash('sha256').update(env.BANK_TOKEN_KEY ?? `bank-token:${env.JWT_SECRET}`).digest();

export function encryptToken(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map(part => part.toString('base64')).join('.');
}

export function decryptToken(stored: string) {
  const [iv, tag, body] = stored.split('.').map(part => Buffer.from(part, 'base64'));
  if (!iv || !tag || !body) throw new Error('Malformed encrypted token');
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}
