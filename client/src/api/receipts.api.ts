import { apiRequest } from './client';

export type ParsedReceipt = {
  merchant: string;
  items: { name: string; unitPriceCents: number | null; quantity: number }[];
  taxCents: number; tipCents: number; totalCents: number | null;
  warnings: string[];
};
export function receiptMimeType(file: File) {
  if ((!file.type || file.type === 'application/octet-stream') && /\.hei[cf]$/i.test(file.name)) return /\.heif$/i.test(file.name) ? 'image/heif' : 'image/heic';
  return file.type;
}
export type GuestReceiptCache = Map<string, ParsedReceipt>;

export async function scanReceipt(file: File, signal: AbortSignal, guest = false, guestCache?: GuestReceiptCache): Promise<{ receipt: ParsedReceipt; cached: boolean }> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Could not read the receipt file.'));
    reader.readAsDataURL(file);
  });
  signal.throwIfAborted();
  const mimeType = receiptMimeType(file);
  // Content, not filename, identifies a receipt. Only the guest component owns this map.
  let key = '';
  if (guest && guestCache) {
    key = globalThis.crypto?.subtle
      ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(base64))), byte => byte.toString(16).padStart(2, '0')).join('')
      : base64;
    key = `${mimeType}:${key}`;
    signal.throwIfAborted();
    const cached = guestCache.get(key);
    if (cached) return { receipt: structuredClone(cached), cached: true };
  }
  const result = await apiRequest<{ receipt: ParsedReceipt; cached: boolean }>(guest ? '/receipts/guest/parse' : '/receipts/parse', { method: 'POST', body: JSON.stringify({ base64, mimeType }), signal });
  if (guest && guestCache && !signal.aborted) guestCache.set(key, structuredClone(result.receipt));
  return result;
}

export type ReceiptAttachment = { name: string; mimeType: 'image/jpeg' | 'application/pdf'; base64: string };
export async function prepareReceiptAttachment(file: File): Promise<ReceiptAttachment> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Could not read the receipt file.'));
    reader.readAsDataURL(file);
  });
  return apiRequest('/receipts/prepare-attachment', { method: 'POST', body: JSON.stringify({ name: file.name, mimeType: receiptMimeType(file), base64 }) });
}
export async function loadReceipt(expenseId: string, signal: AbortSignal): Promise<Blob> {
  const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || '/api'}/expenses/${encodeURIComponent(expenseId)}/receipt`, { credentials: 'include', signal });
  if (!response.ok) throw new Error('Could not load the receipt. Please try again.');
  return response.blob();
}
