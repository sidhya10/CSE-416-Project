import sharp from 'sharp';
import { validateReceipt } from './receipt.validation.js';
import { prepareReceiptImage } from './receipt.image.js';
import { ExpenseError } from '../expenses/expense.error.js';

export async function prepareAttachment(input: { name: string; mimeType: string; base64: string }) {
  const bytes = validateReceipt(input.base64, input.mimeType);
  if (input.mimeType === 'application/pdf') return { name: input.name, mimeType: 'application/pdf' as const, base64: bytes.toString('base64') };
  try {
    const image = await prepareReceiptImage(bytes, input.mimeType);
    for (const [size, quality] of [[3200, 85], [2400, 75], [1800, 65]] as const) {
      const result = await sharp(image, { limitInputPixels: 60_000_000 }).rotate().resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true }).jpeg({ quality }).toBuffer();
      if (result.length <= 1024 * 1024) return { name: input.name.replace(/\.[^.]+$/, '') + '.jpg', mimeType: 'image/jpeg' as const, base64: result.toString('base64') };
    }
  } catch { throw new ExpenseError(400, 'Could not prepare the receipt image. Try a smaller JPEG or PNG.'); }
  throw new ExpenseError(400, 'Receipt image is too large to save. Try a smaller image.');
}
