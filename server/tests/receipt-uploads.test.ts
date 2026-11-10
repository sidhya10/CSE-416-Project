import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
const owner = request.agent(app), other = request.agent(app);
const users: string[] = [], uploads: string[] = [];
let groupId: string;
const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(3 * 1024 * 1024 - 9)]);
beforeAll(async () => {
  if (!/test|integration/i.test(new URL(process.env.DATABASE_URL!).pathname)) throw new Error('Dedicated test database required');
  for (const agent of [owner, other]) {
    const key = randomUUID().slice(0, 8);
    const r = await agent.post('/api/auth/register').send({ name: 'Upload tester', username: `up_${key}`, email: `${key}@example.com`, phone: `+1415${String(Date.now()).slice(-7)}`, password: 'password1' }).expect(201);
    users.push(r.body.user.id);
  }
  groupId = (await owner.post('/api/groups').send({ name: 'Upload group' }).expect(201)).body.group.id;
});
afterAll(async () => {
  if (groupId) await owner.delete(`/api/groups/${groupId}`);
  await prisma.receiptUpload.deleteMany({ where: { id: { in: uploads } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});
it('checks ownership, token, complete chunks, and persists a large PDF via a small expense request', async () => {
  const ref = (await owner.post('/api/receipts/uploads').send({ name: 'large.pdf', mimeType: 'application/pdf', size: pdf.length }).expect(201)).body;
  uploads.push(ref.uploadId);
  const input = { uploadId: ref.uploadId, uploadToken: ref.uploadToken };
  await other.post('/api/receipts/prepare-attachment').send(input).expect(404);
  await owner.post('/api/receipts/prepare-attachment').send(input).expect(400);
  await owner.put(`/api/receipts/uploads/${ref.uploadId}/chunks/0`).send({ uploadToken: 'x'.repeat(43), base64: pdf.subarray(0, ref.chunkSize).toString('base64') }).expect(404);
  for (let offset = 0, index = 0; offset < pdf.length; offset += ref.chunkSize, index++) {
    await owner.put(`/api/receipts/uploads/${ref.uploadId}/chunks/${index}`).send({ uploadToken: ref.uploadToken, base64: pdf.subarray(offset, offset + ref.chunkSize).toString('base64') }).expect(204);
  }
  const prepared = await owner.post('/api/receipts/prepare-attachment').send(input).expect(200);
  expect(prepared.body).toEqual(input);
  const expense = await owner.post(`/api/groups/${groupId}/expenses`).send({ clientRequestId: randomUUID(), expense: { title: 'PDF attachment', paidByUserId: users[0], participantIds: [users[0]], splitMode: 'EQUAL', items: [{ name: 'Tea', quantity: 1, unitPriceCents: 100, assignedUserIds: [] }], receipt: input } }).expect(201);
  const saved = await prisma.expenseReceipt.findUniqueOrThrow({ where: { expenseId: expense.body.expense.id } });
  expect(Buffer.from(saved.data)).toEqual(pdf);
});
it('rejects expired uploads and cleans them before allocating another upload', async () => {
  const ref = (await owner.post('/api/receipts/uploads').send({ name: 'old.pdf', mimeType: 'application/pdf', size: 10 }).expect(201)).body;
  uploads.push(ref.uploadId);
  await prisma.receiptUpload.update({ where: { id: ref.uploadId }, data: { expiresAt: new Date(0) } });
  await owner.post('/api/receipts/prepare-attachment').send({ uploadId: ref.uploadId, uploadToken: ref.uploadToken }).expect(404);
  const next = (await owner.post('/api/receipts/uploads').send({ name: 'new.pdf', mimeType: 'application/pdf', size: 10 }).expect(201)).body;
  uploads.push(next.uploadId);
  expect(await prisma.receiptUpload.findUnique({ where: { id: ref.uploadId } })).toBeNull();
});
it('separates guest uploads from authenticated uploads and bounds chunk sizes', async () => {
  await request(app).post('/api/receipts/uploads').send({ name: 'r.pdf', mimeType: 'application/pdf', size: 10 }).expect(401);
  const ref = (await request(app).post('/api/receipts/uploads?guest=true').send({ name: 'guest.pdf', mimeType: 'application/pdf', size: 10 }).expect(201)).body;
  uploads.push(ref.uploadId);
  await owner.post('/api/receipts/prepare-attachment').send({ uploadId: ref.uploadId, uploadToken: ref.uploadToken }).expect(404);
  await request(app).put(`/api/receipts/uploads/${ref.uploadId}/chunks/0?guest=true`).send({ uploadToken: ref.uploadToken, base64: 'YQ==' }).expect(400);
});
