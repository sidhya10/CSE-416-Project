import { hasHeicSignature, isHeicType, prepareReceiptImage } from './receipt.image.js';
import { createHash } from 'node:crypto';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { ExpenseError } from '../expenses/expense.service.js';
import { analyzeReceipt } from './receipt.azure.js';
import { receiptResult } from './receipt.normalize.js';

export function validateReceipt(base64: string, mimeType: string) {
  if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new ExpenseError(400, 'Invalid receipt encoding.');
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.toString('base64') !== base64) throw new ExpenseError(400, 'Invalid receipt encoding.');
  if (!bytes.length || bytes.length > (isHeicType(mimeType) ? 12 : 4) * 1024 * 1024) throw new ExpenseError(400, 'Choose HEIC/HEIF up to 12 MB, or JPEG, PNG, or PDF up to 4 MB.');
  const valid = isHeicType(mimeType) ? hasHeicSignature(bytes) : mimeType === 'image/jpeg' ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
    : mimeType === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : mimeType === 'application/pdf' && bytes.subarray(0, 5).toString() === '%PDF-';
  if (!valid) throw new ExpenseError(400, 'The file contents do not match a supported HEIC, HEIF, JPEG, PNG, or PDF.');
  return bytes;
}

export async function parseReceipt(userId: string, base64: string, mimeType: string) {
  const bytes = validateReceipt(base64, mimeType);
  const hash = createHash('sha256').update('receipt:2024-11-30:page1:normalizer1:').update(bytes).digest('hex');
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const day = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  const reservation = await prisma.$transaction(async tx => {
    // Shared lock across server processes; no Azure call is made inside this transaction.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(416, 9001)`;
    const existing = await tx.receiptScan.findUnique({ where: { userId_hash: { userId, hash } } });
    if (existing?.result) return { cached: receiptResult.parse(existing.result) };
    if (existing) throw new ExpenseError(409, existing.status === 'PENDING' ? 'This receipt scan is pending. Retry shortly. If it remains pending, ask the administrator to inspect it; no extra scan will be submitted.' : 'This receipt previously failed to scan. Enter items manually or ask the administrator to inspect it; automatic paid retries are disabled.');
    if (!env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT || !env.AZURE_DOCUMENT_INTELLIGENCE_KEY) throw new ExpenseError(503, 'Receipt scanning is not configured yet. You can still enter items manually.');
    const usage = await tx.receiptUsage.upsert({ where: { id: 'azure-receipts' }, create: { id: 'azure-receipts', month }, update: {} });
    if (usage.busyUntil && usage.busyUntil > now) throw new ExpenseError(429, 'Another receipt is scanning. Please try again in a moment.');
    const used = usage.month === month ? usage.attempts : 0;
    if (used >= env.RECEIPT_MONTHLY_PAGE_LIMIT) throw new ExpenseError(429, 'The app monthly receipt scan limit has been reached. Cached receipts and manual entry still work.');
    const daily = await tx.receiptScan.count({ where: { userId, createdAt: { gte: day } } });
    if (daily >= env.RECEIPT_DAILY_USER_LIMIT) throw new ExpenseError(429, 'Your daily receipt scan limit has been reached. Use cached receipts or enter items manually.');
    const scan = await tx.receiptScan.create({ data: { userId, hash } });
    await tx.receiptUsage.update({ where: { id: usage.id }, data: { month, attempts: used + 1, busyUntil: new Date(now.getTime() + 150_000), activeScanId: scan.id } });
    return { scanId: scan.id };
  }, { timeout: 10_000 });
  if (reservation.cached) return { receipt: reservation.cached, cached: true };
  try {
    const prepared = await prepareReceiptImage(bytes, mimeType);
    const receipt = await analyzeReceipt(prepared.toString('base64'));
    await prisma.receiptScan.update({ where: { id: reservation.scanId }, data: { status: 'COMPLETE', result: receipt } });
    return { receipt, cached: false };
  } catch (error) {
    await prisma.receiptScan.update({ where: { id: reservation.scanId }, data: { status: 'FAILED' } });
    if (error instanceof ExpenseError) throw error;
    // Do not expose provider responses, keys, document text, or URLs in logs.
    throw new ExpenseError(502, error instanceof Error && error.name === 'Error' ? error.message : 'Receipt scanning could not finish. Your draft is unchanged; enter items manually.');
  } finally {
    await prisma.receiptUsage.updateMany({ where: { id: 'azure-receipts', activeScanId: reservation.scanId }, data: { busyUntil: new Date(Date.now() + 1500), activeScanId: null } });
  }
}
