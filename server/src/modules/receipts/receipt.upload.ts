import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { ExpenseError } from '../expenses/expense.error.js';
import { validateReceipt } from './receipt.validation.js';

export const CHUNK_SIZE = 1024 * 1024;
export const uploadReference = z.object({ uploadId: z.string().min(1).max(100), uploadToken: z.string().length(43) }).strict();
export const uploadMetadata = z.object({ name: z.string().trim().min(1).max(255), mimeType: z.enum(['image/jpeg', 'image/png', 'application/pdf', 'image/heic', 'image/heif']), size: z.number().int().positive().max(12 * CHUNK_SIZE) }).strict().refine(x => x.size <= (x.mimeType === 'image/heic' || x.mimeType === 'image/heif' ? 12 : 4) * CHUNK_SIZE, 'Receipt exceeds the file size limit');
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export const uploadClientKey = (ip: string) => createHmac('sha256', env.JWT_SECRET).update(ip).digest('hex');
export const cleanReceiptUploads = () => prisma.receiptUpload.deleteMany({ where: { expiresAt: { lte: new Date() } } });

export async function startReceiptUpload(input: z.infer<typeof uploadMetadata>, ownerId: string | null, clientKey: string) {
  const token = randomBytes(32).toString('base64url');
  const upload = await prisma.$transaction(async tx => {
    // Bound temporary storage across processes, including anonymous callers.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(416, 9002)`;
    await tx.receiptUpload.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    const [active, recent] = await Promise.all([
      tx.receiptUpload.count(),
      tx.receiptUpload.count({ where: { clientKey, createdAt: { gte: new Date(Date.now() - 3600_000) } } }),
    ]);
    if (active >= 20 || recent >= 5) throw new ExpenseError(429, 'Too many receipt uploads. Please retry later.');
    return tx.receiptUpload.create({ data: { ...input, ownerId, clientKey, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 3600_000) } });
  });
  return { uploadId: upload.id, uploadToken: token, chunkSize: CHUNK_SIZE };
}
export async function findReceiptUpload(db: Prisma.TransactionClient, ref: z.infer<typeof uploadReference>, ownerId: string | null) {
  const upload = await db.receiptUpload.findUnique({ where: { id: ref.uploadId } });
  const hash = tokenHash(ref.uploadToken);
  if (!upload || upload.ownerId !== ownerId || upload.expiresAt <= new Date() || upload.tokenHash.length !== hash.length || !timingSafeEqual(Buffer.from(hash), Buffer.from(upload.tokenHash))) throw new ExpenseError(404, 'Receipt upload expired or unavailable. Select the file again.');
  return upload;
}
export async function putReceiptChunk(ref: z.infer<typeof uploadReference>, ownerId: string | null, index: number, base64: string) {
  const upload = await findReceiptUpload(prisma, ref, ownerId);
  const bytes = Buffer.from(base64, 'base64');
  const expected = Math.min(CHUNK_SIZE, upload.size - index * CHUNK_SIZE);
  if (index < 0 || expected <= 0 || bytes.length !== expected || bytes.toString('base64') !== base64) throw new ExpenseError(400, 'Invalid receipt chunk');
  await prisma.receiptUploadChunk.upsert({ where: { uploadId_index: { uploadId: upload.id, index } }, create: { uploadId: upload.id, index, data: new Uint8Array(bytes) }, update: { data: new Uint8Array(bytes) } });
}
export async function readReceiptUpload(db: Prisma.TransactionClient, ref: z.infer<typeof uploadReference>, ownerId: string | null) {
  const upload = await findReceiptUpload(db, ref, ownerId);
  const chunks = await db.receiptUploadChunk.findMany({ where: { uploadId: upload.id }, orderBy: { index: 'asc' } });
  if (chunks.length !== Math.ceil(upload.size / CHUNK_SIZE) || chunks.some((chunk, i) => chunk.index !== i)) throw new ExpenseError(400, 'Receipt upload is incomplete');
  const bytes = Buffer.concat(chunks.map(chunk => Buffer.from(chunk.data)));
  if (bytes.length !== upload.size) throw new ExpenseError(400, 'Receipt upload is incomplete');
  const base64 = bytes.toString('base64');
  validateReceipt(base64, upload.mimeType);
  return { name: upload.name, mimeType: upload.mimeType, base64 };
}
