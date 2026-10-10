import { hasHeicSignature, isHeicType } from './receipt.image.js';
import { ExpenseError } from '../expenses/expense.error.js';
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

