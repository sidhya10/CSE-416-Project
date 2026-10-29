import { createHmac, randomBytes } from 'node:crypto';
import { env } from '../../config/env.js';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const normalizeRecoveryCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
export const hashRecoveryCode = (value: string) => createHmac('sha256', env.JWT_SECRET).update(normalizeRecoveryCode(value)).digest('hex');

const createCode = () => {
  const compact = [...randomBytes(16)].map(byte => alphabet[byte & 31]).join('');
  return compact.match(/.{1,4}/g)!.join('-');
};

export function newRecoveryCodes(count = 10) {
  const codes = new Set<string>();
  while (codes.size < count) codes.add(createCode());
  return [...codes];
}
