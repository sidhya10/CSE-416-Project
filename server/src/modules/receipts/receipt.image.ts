import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import { ExpenseError } from '../expenses/expense.error.js';

const require = createRequire(import.meta.url);
export const isHeicType = (type: string) => type === 'image/heic' || type === 'image/heif';

export function hasHeicSignature(bytes: Buffer) {
  if (bytes.length < 16 || bytes.toString('ascii', 4, 8) !== 'ftyp') return false;
  const size = bytes.readUInt32BE(0);
  if (size < 16 || size > bytes.length || size > 4096) return false;
  // Require an HEVC brand; generic mif1 alone may also describe AVIF.
  const brands = [bytes.toString('ascii', 8, 12)];
  for (let offset = 16; offset + 4 <= size; offset += 4) brands.push(bytes.toString('ascii', offset, offset + 4));
  return brands.some(brand => ['heic', 'heix', 'hevc', 'hevx'].includes(brand));
}

// Decoding can be CPU-heavy; isolate it from Express and terminate stuck workers.
const workerSource = `
const { parentPort, workerData } = require('node:worker_threads');
(async () => {
  const convert = require(workerData.converter);
  const sharp = require(workerData.sharp);
  const decoded = await convert({ buffer: Buffer.from(workerData.bytes), format: 'JPEG', quality: 0.95 });
  const input = Buffer.from(decoded);
  for (const [size, quality] of [[3200, 88], [2600, 80], [2000, 72]]) {
    const output = await sharp(input, { limitInputPixels: 60000000 })
      .rotate().resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality }).toBuffer();
    if (output.length <= 4 * 1024 * 1024) { parentPort.postMessage(output); return; }
  }
  throw new Error('Converted image exceeds the limit');
})().catch(() => { parentPort.postMessage({ failed: true }); });
`;

export async function prepareReceiptImage(bytes: Buffer, mimeType: string): Promise<Buffer> {
  if (!isHeicType(mimeType)) return bytes;
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerSource, {
      eval: true,
      workerData: { bytes, converter: require.resolve('heic-convert'), sharp: require.resolve('sharp') },
      resourceLimits: { maxOldGenerationSizeMb: 256 },
    });
    let settled = false;
    const finish = (value?: Uint8Array) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      if (value?.length && value.length <= 4 * 1024 * 1024) resolve(Buffer.from(value));
      else reject(new ExpenseError(400, 'Could not convert this HEIC photo. Export it as JPEG or choose a smaller photo. Your entries are unchanged.'));
    };
    const timer = setTimeout(() => finish(), 25_000);
    worker.once('message', (value: unknown) => finish(value instanceof Uint8Array ? value : undefined));
    worker.once('error', () => finish());
    worker.once('exit', () => finish());
  });
}
