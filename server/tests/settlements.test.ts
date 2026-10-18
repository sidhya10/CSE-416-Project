import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
const agents = [request.agent(app), request.agent(app), request.agent(app), request.agent(app)];
const [owner, member, observer, outsider] = agents;
const ids: string[] = [], groups: string[] = [];
const run = randomUUID().slice(0, 8);
beforeAll(async () => {
  for (const [index, agent] of agents.entries()) {
    const created = await agent!.post('/api/auth/register').send({ name: ['Alex', 'Jordan', 'Casey', 'Outside'][index], username: `settle_${index}_${run}`, email: `settle-${index}-${run}@example.com`, password: 'password1' }).expect(201);
    ids.push(created.body.user.id);
  }
});
afterAll(async () => {
  await prisma.expensePayment.deleteMany({ where: { share: { expense: { groupId: { in: groups } } } } });
  await prisma.expense.deleteMany({ where: { groupId: { in: groups } } });
  await prisma.group.deleteMany({ where: { id: { in: groups } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});
async function group() {
  const created = await owner!.post('/api/groups').send({ name: 'Current period', memberIds: ids.slice(1, 3) }).expect(201);
  groups.push(created.body.group.id); return created.body.group.id as string;
}
async function expense(groupId: string, title = 'Dinner', payer = ids[0]!, price = 6000, participantIds = ids.slice(0, 3)) {
  const input = { title, expenseDate: new Date().toISOString().slice(0, 10), paidByUserId: payer, participantIds, splitMode: 'EQUAL', items: [{ name: title, quantity: 1, unitPriceCents: price, assignedUserIds: [] }], taxCents: 0, tipCents: 0, otherCents: 0 };
  const created = await owner!.post(`/api/groups/${groupId}/expenses`).send({ clientRequestId: randomUUID(), expense: input }).expect(201);
  return { id: created.body.expense.id as string, input };
}
async function initialize(groupId: string, agent = member!) {
  const preview = await agent.get(`/api/groups/${groupId}/settlements/preview`).expect(200);
  return agent.post(`/api/groups/${groupId}/settlements`).send({ expenseIds: preview.body.expenseIds, totalCents: preview.body.totalCents, clientRequestId: randomUUID() }).expect(201);
}
async function sendAndConfirm(expenseId: string, agent: typeof owner, senderId: string, amountCents: number) {
  const sent = await agent!.post(`/api/expenses/${expenseId}/payments`).send({ amountCents, clientRequestId: randomUUID() }).expect(201);
  await owner!.patch(`/api/expenses/${expenseId}/payments/${sent.body.payment.id}`).send({ status: 'CONFIRMED' }).expect(200);
  return senderId;
}
it('allows any member to initialize only unpaid, unbatched transactions, preserves shares and subtracts previous confirmed payments', async () => {
  const id = await group(), settled = await expense(id, 'Old paid'), current = await expense(id);
  await sendAndConfirm(settled.id, member, ids[1]!, 2000); await sendAndConfirm(settled.id, observer, ids[2]!, 2000);
  await sendAndConfirm(current.id, member, ids[1]!, 500);
  const preview = await member!.get(`/api/groups/${id}/settlements/preview`).expect(200);
  expect(preview.body).toMatchObject({ expenseIds: [current.id], totalCents: 3500 });
  await request(app).get(`/api/groups/${id}/settlements/preview`).expect(401);
  await outsider!.get(`/api/groups/${id}/settlements/preview`).expect(404);
  const payload = { ...preview.body, clientRequestId: randomUUID() }; delete payload.expenses;
  const created = await observer!.post(`/api/groups/${id}/settlements`).send(payload).expect(201);
  expect(created.body.batch.pairs.map((p: { amountCents: number }) => p.amountCents).sort()).toEqual([1500, 2000]);
  const repeat = await observer!.post(`/api/groups/${id}/settlements`).send(payload).expect(201);
  expect(repeat.body.batch.id).toBe(created.body.batch.id);
  expect(await prisma.settlementBatch.count({ where: { groupId: id } })).toBe(1);
  expect((await member!.get(`/api/groups/${id}/settlements/preview`).expect(200)).body.expenseIds).toEqual([]);
  await owner!.put(`/api/expenses/${current.id}`).send({ version: 1, expense: current.input }).expect(409);
  await expense(id, 'New period');
  const next = await initialize(id);
  expect(next.body.batch.expenses).toHaveLength(1);
  expect(next.body.batch.expenses[0].title).toBe('New period');
  expect(await prisma.expense.count({ where: { groupId: id } })).toBe(3);
  expect((await prisma.expense.findUniqueOrThrow({ where: { id: settled.id } })).settlementBatchId).toBeNull();
});
it('rejects stale previews and concurrent initialization cannot double-charge expenses', async () => {
  const id = await group(); await expense(id);
  const preview = (await member!.get(`/api/groups/${id}/settlements/preview`)).body;
  const payload = { expenseIds: preview.expenseIds, totalCents: preview.totalCents, clientRequestId: randomUUID() };
  await expense(id, 'Added after preview');
  await member!.post(`/api/groups/${id}/settlements`).send(payload).expect(409);
  const latest = (await member!.get(`/api/groups/${id}/settlements/preview`)).body;
  const results = await Promise.all([member!, observer!].map(agent => agent.post(`/api/groups/${id}/settlements`).send({ expenseIds: latest.expenseIds, totalCents: latest.totalCents, clientRequestId: randomUUID() })));
  expect(results.map(r => r.status).sort()).toEqual([201, 409]);
  expect(await prisma.settlementBatch.count({ where: { groupId: id } })).toBe(1);
  expect(await prisma.settlementShare.count({ where: { batch: { groupId: id } } })).toBe(4);
});
it('reports how money was sent atomically across expenses, confirms only as recipient and does not count it twice', async () => {
  const id = await group(); await expense(id); await expense(id, 'Taxi', ids[0]!, 3000);
  const batch = (await initialize(id)).body.batch;
  const batchId = batch.id as string;
  await outsider!.post(`/api/settlements/${batchId}/payments`).send({ recipientId: ids[0], amountCents: 3000, method: 'Venmo', clientRequestId: randomUUID() }).expect(404);
  const payload = { recipientId: ids[0], amountCents: 3000, method: 'Venmo', clientRequestId: randomUUID() };
  const sent = await member!.post(`/api/settlements/${batchId}/payments`).send(payload).expect(200);
  const repeat = await member!.post(`/api/settlements/${batchId}/payments`).send(payload).expect(200);
  const pair = repeat.body.batch.pairs.find((p: { senderId: string }) => p.senderId === ids[1]);
  expect(pair).toMatchObject({ pendingCents: 3000, confirmedCents: 0, unreportedCents: 0 });
  expect(pair.pendingPayments).toHaveLength(2);
  expect(pair.pendingPayments.every((p: { method: string }) => p.method === 'Venmo')).toBe(true);
  await member!.post(`/api/settlements/${batchId}/payments`).send({ ...payload, clientRequestId: randomUUID() }).expect(409);
  const confirm = { senderId: ids[1], paymentIds: pair.pendingPayments.map((p: { id: string }) => p.id), status: 'CONFIRMED' };
  await observer!.post(`/api/settlements/${batchId}/confirm`).send(confirm).expect(403);
  await member!.post(`/api/settlements/${batchId}/confirm`).send(confirm).expect(403);
  await owner!.post(`/api/settlements/${batchId}/confirm`).send(confirm).expect(200);
  await owner!.post(`/api/settlements/${batchId}/confirm`).send(confirm).expect(200);
  const inbox = await member!.get('/api/settlements').expect(200);
  const notice = inbox.body.notices.find((n: { batchId: string }) => n.batchId === batchId);
  expect(notice.message).toContain('confirmed receiving $30.00');
  expect(await prisma.settlementNotice.count({ where: { batchId, kind: 'CONFIRMED' } })).toBe(1);
  await observer!.post(`/api/settlement-notices/${notice.id}/read`).expect(404);
  await member!.post(`/api/settlement-notices/${notice.id}/read`).expect(204);
  expect((await member!.get('/api/settlements')).body.notices.some((n: { id: string }) => n.id === notice.id)).toBe(false);
  const balance = (await owner!.get(`/api/groups/${id}/balances`).expect(200)).body.balances.find((b: { userId: string }) => b.userId === ids[1]);
  expect(balance.balanceCents).toBe(0);
  expect((await owner!.get('/api/settlements')).body.batches.find((b: { id: string }) => b.id === batchId).completed).toBe(false);
  expect(sent.body.batch.totalCents).toBe(6000);
});
it('sends in-app reminders only to unsent debtors, enforces cooldown even after dismissal and supports issue/retry', async () => {
  const id = await group(); await expense(id);
  const batchId = (await initialize(id)).body.batch.id;
  await member!.post(`/api/settlements/${batchId}/reminders`).send({ recipientId: ids[2] }).expect(409);
  await owner!.post(`/api/settlements/${batchId}/reminders`).send({ recipientId: ids[1] }).expect(204);
  const notice = (await member!.get('/api/settlements')).body.notices.find((n: { batchId: string }) => n.batchId === batchId);
  expect(notice.message).toContain('reminded you to send $20.00');
  await member!.post(`/api/settlement-notices/${notice.id}/read`).expect(204);
  await owner!.post(`/api/settlements/${batchId}/reminders`).send({ recipientId: ids[1] }).expect(429);
  const send = async () => member!.post(`/api/settlements/${batchId}/payments`).send({ recipientId: ids[0], amountCents: 2000, method: 'Cash', clientRequestId: randomUUID() }).expect(200);
  let pair = (await send()).body.batch.pairs.find((p: { senderId: string }) => p.senderId === ids[1]);
  await owner!.post(`/api/settlements/${batchId}/reminders`).send({ recipientId: ids[1] }).expect(409);
  await owner!.post(`/api/settlements/${batchId}/confirm`).send({ senderId: ids[1], paymentIds: pair.pendingPayments.map((p: { id: string }) => p.id), status: 'ISSUE' }).expect(200);
  pair = (await send()).body.batch.pairs.find((p: { senderId: string }) => p.senderId === ids[1]);
  expect(pair.pendingCents).toBe(2000);
  await owner!.post(`/api/settlements/${batchId}/confirm`).send({ senderId: ids[1], paymentIds: pair.pendingPayments.map((p: { id: string }) => p.id), status: 'CONFIRMED' }).expect(200);
  await owner!.delete(`/api/groups/${id}`).expect(204);
  expect(await prisma.settlementBatch.count({ where: { id: batchId } })).toBe(0);
  expect(await prisma.settlementNotice.count({ where: { batchId } })).toBe(0);
  expect((await outsider!.get('/api/settlements')).body.batches).toEqual([]);
});
it('preserves legacy pending reports and serializes competing send confirmations', async () => {
  const id = await group(), source = await expense(id);
  await member!.post(`/api/expenses/${source.id}/payments`).send({ amountCents: 500, clientRequestId: randomUUID() }).expect(201);
  const batchId = (await initialize(id)).body.batch.id;
  const report = () => member!.post(`/api/settlements/${batchId}/payments`).send({ recipientId: ids[0], amountCents: 1500, method: 'Zelle', clientRequestId: randomUUID() });
  const results = await Promise.all([report(), report()]);
  expect(results.map(r => r.status).sort()).toEqual([200, 409]);
  const batch = (await owner!.get('/api/settlements')).body.batches.find((b: { id: string }) => b.id === batchId);
  const pair = batch.pairs.find((p: { senderId: string }) => p.senderId === ids[1]);
  expect(pair.pendingCents).toBe(2000); expect(pair.unreportedCents).toBe(0);
  expect(await prisma.expensePayment.count({ where: { expenseId: source.id, senderUserId: ids[1] } })).toBe(2);
  await owner!.post(`/api/settlements/${batchId}/confirm`).send({ senderId: ids[1], paymentIds: pair.pendingPayments.map((p: { id: string }) => p.id), status: 'CONFIRMED' }).expect(200);
  const other = await observer!.post(`/api/settlements/${batchId}/payments`).send({ recipientId: ids[0], amountCents: 2000, method: 'Cash', clientRequestId: randomUUID() }).expect(200);
  const otherPair = other.body.batch.pairs.find((p: { senderId: string }) => p.senderId === ids[2]);
  const done = await owner!.post(`/api/settlements/${batchId}/confirm`).send({ senderId: ids[2], paymentIds: otherPair.pendingPayments.map((p: { id: string }) => p.id), status: 'CONFIRMED' }).expect(200);
  expect(done.body.batch.completed).toBe(true);
  expect((await owner!.get(`/api/groups/${id}`)).body.group.canArchive).toBe(true);
  expect((await member!.get(`/api/groups/${id}/settlements/preview`)).body.totalCents).toBe(0);
});

it('keeps opposite-direction obligations even when every member has a zero net balance', async () => {
  const id = await group();
  await expense(id, 'A paid', ids[0]!, 6000, ids.slice(0, 2));
  await expense(id, 'B paid', ids[1]!, 6000, ids.slice(0, 2));
  const balances = (await owner!.get(`/api/groups/${id}/balances`)).body.balances;
  expect(balances.every((b: { balanceCents: number }) => b.balanceCents === 0)).toBe(true);
  const batch = (await initialize(id, observer!)).body.batch;
  expect(batch.totalCents).toBe(6000);
  expect(batch.completed).toBe(false);
  expect(batch.pairs).toHaveLength(2);
});
it('retains a period when its non-financial initiator deletes their account', async () => {
  const id = await group(); await expense(id, 'Others paid', ids[0]!, 6000, ids.slice(0, 2));
  const initiator = request.agent(app);
  const created = await initiator.post('/api/auth/register').send({ name: 'Initiator', username: `initiator_${run}`, email: `initiator-${run}@example.com`, password: 'password1' }).expect(201);
  const initiatorId = created.body.user.id as string;
  ids.push(initiatorId);
  await owner!.post(`/api/groups/${id}/invitations`).send({ userIds: [initiatorId] }).expect(201);
  const batchId = (await initialize(id, initiator)).body.batch.id;
  await initiator.delete('/api/users/me').expect(204);
  expect((await prisma.settlementBatch.findUniqueOrThrow({ where: { id: batchId } })).createdById).toBeNull();
  expect((await member!.get('/api/settlements')).body.batches.some((b: { id: string }) => b.id === batchId)).toBe(true);
  expect(await prisma.expense.count({ where: { groupId: id, settlementBatchId: batchId } })).toBe(1);
});
