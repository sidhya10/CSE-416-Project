import { describe, it, expect } from 'vitest';
import { hasHeicSignature, prepareReceiptImage } from '../src/modules/receipts/receipt.image.js';
import { validateReceipt } from '../src/modules/receipts/receipt.service.js';
const heic = () => { const bytes = Buffer.alloc(24); bytes.writeUInt32BE(24); bytes.write('ftyp', 4); bytes.write('mif1', 8); bytes.write('heic', 16); return bytes; };
describe('HEIC input validation and conversion failures', () => {
  it('recognizes HEVC compatible brands but rejects AVIF and truncated boxes', () => {
    expect(hasHeicSignature(heic())).toBe(true);
    const avif = heic(); avif.write('avif', 16);
    expect(hasHeicSignature(avif)).toBe(false);
    expect(hasHeicSignature(heic().subarray(0, 18))).toBe(false);
  });
  it('allows larger HEIC originals without relaxing other file limits', () => {
    const original = Buffer.concat([heic(), Buffer.alloc(5 * 1024 * 1024)]);
    expect(validateReceipt(original.toString('base64'), 'image/heic').length).toBe(original.length);
    expect(() => validateReceipt(original.toString('base64'), 'image/png')).toThrow('4 MB');
    expect(() => validateReceipt(Buffer.alloc(12 * 1024 * 1024 + 1).toString('base64'), 'image/heic')).toThrow('12 MB');
  });
  it('returns a friendly error for a corrupt HEIC and passes other formats through', async () => {
    await expect(prepareReceiptImage(heic(), 'image/heic')).rejects.toThrow('Could not convert');
    const bytes = Buffer.from('%PDF-1.4');
    expect(await prepareReceiptImage(bytes, 'application/pdf')).toBe(bytes);
  });
});

it('compresses a real image to a displayable JPEG attachment without Azure', async () => {
  const { default: sharp } = await import('sharp');
  const { prepareAttachment } = await import('../src/modules/receipts/receipt.attachment.js');
  const png = await sharp({ create: { width: 4000, height: 1000, channels: 3, background: 'white' } }).png().toBuffer();
  const result = await prepareAttachment({ name: 'long.png', mimeType: 'image/png', base64: png.toString('base64') });
  const bytes = Buffer.from(result.base64, 'base64');
  expect(result.mimeType).toBe('image/jpeg');
  expect(bytes.length).toBeLessThanOrEqual(1024 * 1024);
  expect((await sharp(bytes).metadata()).width).toBe(3200);
});
