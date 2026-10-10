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
export async function scanReceipt(file: File, signal: AbortSignal): Promise<{ receipt: ParsedReceipt; cached: boolean }> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Could not read the receipt file.'));
    reader.readAsDataURL(file);
  });
  return apiRequest('/receipts/parse', { method: 'POST', body: JSON.stringify({ base64, mimeType: receiptMimeType(file) }), signal });
}
