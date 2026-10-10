import { prepareReceiptImage } from '../src/modules/receipts/receipt.image.js';
import { ExpenseError } from '../src/modules/expenses/expense.service.js';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { analyzeReceipt } from '../src/modules/receipts/receipt.azure.js';
import { normalizeReceipt } from '../src/modules/receipts/receipt.normalize.js';
import { validateReceipt } from '../src/modules/receipts/receipt.service.js';

vi.mock('../src/modules/receipts/receipt.image.js', async importOriginal => ({ ...await importOriginal<typeof import('../src/modules/receipts/receipt.image.js')>(), prepareReceiptImage: vi.fn(async (bytes: Buffer) => bytes) }));
vi.mock('../src/modules/receipts/receipt.azure.js', () => ({ analyzeReceipt: vi.fn() }));
const result = { merchant: 'Cafe', items: [{ name: 'Tea', unitPriceCents: 250, quantity: 2 }], taxCents: 40, tipCents: 100, totalCents: 640, warnings: [] };
const agent = request.agent(app);
const other = request.agent(app);
const users: string[] = [];
const original = { ...env };
const input = (text = randomUUID()) => ({ base64: Buffer.from(`%PDF-1.4 ${text}`).toString('base64'), mimeType: 'application/pdf' });
beforeAll(async () => {
  if (!/test|integration/i.test(new URL(env.DATABASE_URL).pathname)) throw new Error('Receipt integration tests require a dedicated test database (name must contain test or integration).');
  for (const client of [agent, other]) {
    const id = randomUUID().replaceAll('-', '').slice(0, 12);
    const res = await client.post('/api/auth/register').send({ name: 'Receipt Test', username: `r_${id}`, email: `${id}@example.com`, password: 'password1' }).expect(201);
    users.push(res.body.user.id);
  }
});
beforeEach(async () => {
  vi.mocked(prepareReceiptImage).mockReset().mockImplementation(async bytes => bytes);
  vi.mocked(analyzeReceipt).mockReset().mockResolvedValue(result);
  env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = 'https://test.cognitiveservices.azure.com';
  env.AZURE_DOCUMENT_INTELLIGENCE_KEY = 'fake-test-key';
  env.RECEIPT_MONTHLY_PAGE_LIMIT = 450;
  env.RECEIPT_DAILY_USER_LIMIT = 20;
  await prisma.receiptScan.deleteMany({ where: { userId: { in: users } } });
  await prisma.receiptUsage.deleteMany();
});
afterEach(() => Object.assign(env, original));
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  if (users.length) await prisma.receiptUsage.deleteMany();
  await prisma.$disconnect();
});
describe('receipt API and persistent cache (mock Azure, real test database)', () => {
  it('requires authentication and rejects unsupported contents before Azure', async () => {
    await request(app).post('/api/receipts/parse').send(input()).expect(401);
    await agent.post('/api/receipts/parse').send({ base64: 'YmFk', mimeType: 'image/png' }).expect(400);
    await agent.post('/api/receipts/parse').send({ ...input(), mimeType: 'image/heic' }).expect(400);
    expect(analyzeReceipt).not.toHaveBeenCalled();
  });
  it('reuses persisted results without another attempt, even when disabled; isolates users', async () => {
    const body = input();
    expect((await agent.post('/api/receipts/parse').send(body).expect(200)).body.cached).toBe(false);
    env.RECEIPT_MONTHLY_PAGE_LIMIT = 0;
    expect((await agent.post('/api/receipts/parse').send(body).expect(200)).body).toEqual({ receipt: result, cached: true });
    await prisma.receiptUsage.updateMany({ data: { busyUntil: null } });
    await other.post('/api/receipts/parse').send(body).expect(429);
    expect(analyzeReceipt).toHaveBeenCalledTimes(1);
    expect((await prisma.receiptUsage.findUniqueOrThrow({ where: { id: 'azure-receipts' } })).attempts).toBe(1);
  });
  it('reserves only one scan for concurrent identical uploads', async () => {
    let finish!: (value: typeof result) => void;
    vi.mocked(analyzeReceipt).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const body = input();
    const first = agent.post('/api/receipts/parse').send(body).then(response => response);
    await vi.waitFor(() => expect(analyzeReceipt).toHaveBeenCalledTimes(1));
    await agent.post('/api/receipts/parse').send(body).expect(409);
    finish(result);
    expect((await first).status).toBe(200);
  });
  it('counts failed submissions and blocks automatic paid retries', async () => {
    vi.mocked(analyzeReceipt).mockRejectedValue(new Error('Azure could not read this receipt.'));
    const body = input();
    await agent.post('/api/receipts/parse').send(body).expect(502);
    await agent.post('/api/receipts/parse').send(body).expect(409);
    expect(analyzeReceipt).toHaveBeenCalledTimes(1);
    expect((await prisma.receiptUsage.findUniqueOrThrow({ where: { id: 'azure-receipts' } })).attempts).toBe(1);
  });
  it('enforces monthly limits, resets the UTC month, and enforces daily limits', async () => {
    await prisma.receiptUsage.create({ data: { id: 'azure-receipts', month: new Date().toISOString().slice(0, 7), attempts: 450 } });
    await agent.post('/api/receipts/parse').send(input()).expect(429);
    await prisma.receiptUsage.updateMany({ data: { month: '2020-01' } });
    await agent.post('/api/receipts/parse').send(input()).expect(200);
    expect((await prisma.receiptUsage.findUniqueOrThrow({ where: { id: 'azure-receipts' } })).attempts).toBe(1);
    await prisma.receiptUsage.updateMany({ data: { busyUntil: null } });
    env.RECEIPT_DAILY_USER_LIMIT = 1;
    await agent.post('/api/receipts/parse').send(input()).expect(429);
    expect(analyzeReceipt).toHaveBeenCalledTimes(1);
  });
  it('allows manual entry deployments without Azure configuration', async () => {
    env.AZURE_DOCUMENT_INTELLIGENCE_KEY = undefined;
    await agent.post('/api/receipts/parse').send(input()).expect(503);
    expect(analyzeReceipt).not.toHaveBeenCalled();
  });
});
describe('receipt normalization', () => {
  it('derives unit cents from line total and does not multiply totals twice', () => {
    const receipt = normalizeReceipt({ documents: [{ fields: { Items: { valueArray: [{ valueObject: { Description: { valueString: 'Tea' }, Quantity: { valueNumber: 2 }, TotalPrice: { valueCurrency: { amount: 5 } } } }] }, Total: { valueCurrency: { amount: 5, currencyCode: 'USD' } } } }] });
    expect(receipt.items[0]).toEqual({ name: 'Tea', quantity: 2, unitPriceCents: 250 });
    expect(receipt.warnings.some(value => value.includes('do not match'))).toBe(false);
  });
  it('preserves missing prices and warns about fractional quantities and mismatches', () => {
    const receipt = normalizeReceipt({ documents: [{ fields: { Items: { valueArray: [{ valueObject: { Quantity: { valueNumber: 0.5 }, TotalPrice: { valueNumber: 3.01 } } }, { valueObject: {} }] }, Total: { valueNumber: 10 } } }] });
    expect(receipt.items[0]).toMatchObject({ quantity: 1, unitPriceCents: 301 });
    expect(receipt.items[1]?.unitPriceCents).toBeNull();
    expect(receipt.warnings.some(value => value.includes('do not match'))).toBe(true);
  });
  it('rejects known foreign currency and oversized files', () => {
    expect(() => normalizeReceipt({ documents: [{ fields: { Total: { valueCurrency: { amount: 1, currencyCode: 'EUR' } } } }] })).toThrow('USD');
    expect(() => validateReceipt(Buffer.alloc(4 * 1024 * 1024 + 1).toString('base64'), 'image/png')).toThrow('4 MB');
  });
});

it('converts before Azure, then caches by original HEIC bytes without reconverting', async () => {
  const bytes = Buffer.alloc(24); bytes.writeUInt32BE(24); bytes.write('ftyp', 4); bytes.write('heic', 8);
  const jpeg = Buffer.from([255, 216, 255, 0]);
  vi.mocked(prepareReceiptImage).mockResolvedValue(jpeg);
  const body = { base64: bytes.toString('base64'), mimeType: 'image/heic' };
  await agent.post('/api/receipts/parse').send(body).expect(200);
  expect(analyzeReceipt).toHaveBeenCalledWith(jpeg.toString('base64'));
  expect((await agent.post('/api/receipts/parse').send(body).expect(200)).body.cached).toBe(true);
  expect(prepareReceiptImage).toHaveBeenCalledTimes(1);
  expect(analyzeReceipt).toHaveBeenCalledTimes(1);
});
it('does not call Azure when conversion fails', async () => {
  const bytes = Buffer.alloc(24); bytes.writeUInt32BE(24); bytes.write('ftyp', 4); bytes.write('heic', 8);
  vi.mocked(prepareReceiptImage).mockRejectedValue(new ExpenseError(400, 'Could not convert this HEIC photo.'));
  await agent.post('/api/receipts/parse').send({ base64: bytes.toString('base64'), mimeType: 'image/heic' }).expect(400);
  expect(analyzeReceipt).not.toHaveBeenCalled();
});
