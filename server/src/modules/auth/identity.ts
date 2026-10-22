import { z } from 'zod';
import { prisma } from '../../config/database.js';

const phoneCharacters = /^[+\d\s().-]+$/;

export function normalizePhone(value: string) {
  const trimmed = value.trim();
  if (!phoneCharacters.test(trimmed)) return null;
  let digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) digits = `1${digits}`;
  return digits.length >= 7 && digits.length <= 15 ? `+${digits}` : null;
}

export const phoneSchema = z.string().trim().min(1, 'Phone number is required').max(40).transform((value, context) => {
  const normalized = normalizePhone(value);
  if (!normalized) {
    context.addIssue({ code: 'custom', message: 'Enter a valid phone number with 7 to 15 digits' });
    return z.NEVER;
  }
  return normalized;
});

export async function findUserByIdentifier(raw: string) {
  const identifier = raw.trim();
  if (!identifier) return null;
  if (identifier.includes('@')) return prisma.user.findUnique({ where: { email: identifier.toLowerCase() } });

  const normalizedPhone = normalizePhone(identifier);
  if (normalizedPhone) {
    const exact = await prisma.user.findUnique({ where: { phone: normalizedPhone } });
    if (exact) return exact;
    // Compatibility for phone values created before registration began canonicalizing them.
    const candidates = await prisma.user.findMany({ where: { phone: { not: null } } });
    const matches = candidates.filter(user => user.phone && normalizePhone(user.phone) === normalizedPhone);
    return matches.length === 1 ? matches[0] : null;
  }

  return prisma.user.findUnique({ where: { username: identifier.replace(/^@/, '').toLowerCase() } });
}
