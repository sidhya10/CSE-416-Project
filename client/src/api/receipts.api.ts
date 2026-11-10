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
  signal.throwIfAborted();
  const mimeType = receiptMimeType(file);
  let key = '';
  if (guest && guestCache) {
    const contents = await readBase64(file);
    key = globalThis.crypto?.subtle
      ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(contents))), byte => byte.toString(16).padStart(2, '0')).join('')
      : contents;
    key = `${mimeType}:${key}`;
    signal.throwIfAborted();
    const cached = guestCache.get(key);
    if (cached) return { receipt: structuredClone(cached), cached: true };
  }
  const transport = await receiptTransport(file, guest, signal);
  const result = await apiRequest<{ receipt: ParsedReceipt; cached: boolean }>(guest ? '/receipts/guest/parse' : '/receipts/parse', { method: 'POST', body: JSON.stringify(transport), signal });
  if (guest && guestCache && !signal.aborted) guestCache.set(key, structuredClone(result.receipt));
  return result;
}

export type ReceiptAttachment = { name: string; mimeType: 'image/jpeg' | 'application/pdf'; base64: string } | { uploadId: string; uploadToken: string };
export async function prepareReceiptAttachment(file: File): Promise<ReceiptAttachment> {
  const transport = await receiptTransport(file, false);
  const input = 'uploadId' in transport ? transport : { ...transport, name: file.name };
  return apiRequest('/receipts/prepare-attachment', { method: 'POST', body: JSON.stringify(input) });
}

// A 1 MB binary chunk becomes about 1.4 MB of JSON, below Vercel's 4.5 MB cap.
const readBase64 = (file: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
  reader.onerror = () => reject(new Error('Could not read the receipt file.'));
  reader.readAsDataURL(file);
});
type ReceiptTransport = { base64: string; mimeType: string; uploadId?: never; uploadToken?: never } | { uploadId: string; uploadToken: string; base64?: never; mimeType?: never };
async function receiptTransport(file: File, guest: boolean, signal?: AbortSignal): Promise<ReceiptTransport> {
  signal?.throwIfAborted();
  const mimeType = receiptMimeType(file);
  const maxSize = mimeType === 'image/heic' || mimeType === 'image/heif' ? 12 : 4;
  if (file.size > maxSize * 1024 * 1024) throw new Error(`Choose a receipt under ${maxSize} MB.`);
  if (file.size <= 2 * 1024 * 1024) {
    const base64 = await readBase64(file);
    signal?.throwIfAborted();
    return { base64, mimeType };
  }
  const suffix = guest ? '?guest=true' : '';
  const upload = await apiRequest<{ uploadId: string; uploadToken: string; chunkSize: number }>(`/receipts/uploads${suffix}`, { method: 'POST', body: JSON.stringify({ name: file.name, mimeType, size: file.size }), signal });
  for (let offset = 0, index = 0; offset < file.size; offset += upload.chunkSize, index++) {
    signal?.throwIfAborted();
    const base64 = await readBase64(file.slice(offset, offset + upload.chunkSize));
    await apiRequest(`/receipts/uploads/${encodeURIComponent(upload.uploadId)}/chunks/${index}${suffix}`, { method: 'PUT', body: JSON.stringify({ uploadToken: upload.uploadToken, base64 }), signal });
  }
  return { uploadId: upload.uploadId, uploadToken: upload.uploadToken };
}

export async function loadReceipt(expenseId: string, signal: AbortSignal): Promise<Blob> {
  const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || '/api'}/expenses/${encodeURIComponent(expenseId)}/receipt`, { credentials: 'include', signal });
  if (!response.ok) throw new Error('Could not load the receipt. Please try again.');
  return response.blob();
}
