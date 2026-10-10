import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';

const owner = request.agent(app);
const member = request.agent(app);
const outsider = request.agent(app);
const userIds: string[] = [];
const groupIds: string[] = [];
let ownerId: string;
let memberId: string;
let outsiderId: string;
let groupId: string;
const run = randomUUID().replaceAll('-', '').slice(0, 16);

beforeAll(async () => {
  for (const [index, agent] of [owner, member, outsider].entries()) {
    const result = await agent.post('/api/auth/register').send({ name: `Expense Test ${index}`, username: `exp_${run}_${index}`, email: `exp_${run}_${index}@example.com`, password: 'password1' }).expect(201);
    userIds.push(result.body.user.id);
  }
  [ownerId, memberId, outsiderId] = userIds as [string, string, string];
  await owner.post(`/api/friends/${memberId}`).expect(201);
  const result = await owner.post('/api/groups').send({ name: 'Receipt test group', memberIds: [memberId] }).expect(201);
  groupId = result.body.group.id;
  groupIds.push(groupId);
});

afterAll(async () => {
  await prisma.expensePayment.deleteMany({ where: { expenseId: { in: (await prisma.expense.findMany({ where: { groupId: { in: groupIds } }, select: { id: true } })).map(value => value.id) } } });
  await prisma.expense.deleteMany({ where: { groupId: { in: groupIds } } });
  await prisma.groupMembership.deleteMany({ where: { groupId: { in: groupIds } } });
  await prisma.group.deleteMany({ where: { id: { in: groupIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

const input = () => ({ title: 'Dinner', expenseDate: '2026-10-09', paidByUserId: ownerId, splitMode: 'EQUAL', participantIds: [ownerId, memberId], items: [{ name: 'Noodles', unitPriceCents: 1001, quantity: 2 }], taxCents: 101, tipCents: 0, otherCents: 0 });
const create = (expense = input(), clientRequestId = randomUUID()) => owner.post(`/api/groups/${groupId}/expenses`).send({ clientRequestId, expense });

describe('persisted expenses and settlements', () => {
  it('requires authentication and group membership', async () => {
    await request(app).get('/api/groups').expect(401);
    await outsider.get(`/api/groups/${groupId}`).expect(404);
    await outsider.get(`/api/groups/${groupId}/expenses`).expect(404);
    await outsider.get(`/api/groups/${groupId}/balances`).expect(404);
    await outsider.post(`/api/groups/${groupId}/expenses`).send({ clientRequestId: randomUUID(), expense: input() }).expect(404);
    await member.post(`/api/groups/${groupId}/invitations`).send({ userIds: [outsiderId] }).expect(403);
    const groups = await member.get('/api/groups').expect(200);
    expect(groups.body.groups.map((group: { id: string }) => group.id)).toContain(groupId);
  });

  it('saves quantities and rounding, survives a new session, and prevents duplicate submissions', async () => {
    const key = randomUUID();
    const created = await create(input(), key).expect(201);
    const expense = created.body.expense;
    expect(expense.totalCents).toBe(2103);
    expect(expense.shares.map((share: { totalCents: number }) => share.totalCents)).toEqual([1052, 1051]);
    expect(expense.items[0]).toMatchObject({ quantity: 2, unitPriceCents: 1001 });
    const repeated = await create(input(), key).expect(201);
    expect(repeated.body.expense.id).toBe(expense.id);
    expect(await prisma.expense.count({ where: { clientRequestId: key } })).toBe(1);
    const newSession = request.agent(app);
    await newSession.post('/api/auth/login').send({ email: `exp_${run}_1@example.com`, password: 'password1' }).expect(200);
    const loaded = await newSession.get(`/api/expenses/${expense.id}`).expect(200);
    expect(loaded.body.expense).toEqual(expense);
    await outsider.get(`/api/expenses/${expense.id}`).expect(404);
    const latest = await create({ ...input(), title: 'Newest' }).expect(201);
    const listed = await member.get(`/api/groups/${groupId}/expenses`).expect(200);
    expect(listed.body.expenses[0].id).toBe(latest.body.expense.id);
    // No payments exist yet, so editing this record remains possible.
    await member.put(`/api/expenses/${expense.id}`).send({ version: 1, expense: input() }).expect(403);
    const edited = await owner.put(`/api/expenses/${expense.id}`).send({ version: 1, expense: { ...input(), title: 'Updated' } }).expect(200);
    expect(edited.body.expense.version).toBe(2);
    await owner.put(`/api/expenses/${expense.id}`).send({ version: 1, expense: input() }).expect(409);
  });

  it('rejects invalid inputs without saving any expense', async () => {
    const before = await prisma.expense.count({ where: { groupId } });
    await create({ ...input(), participantIds: [ownerId, outsiderId] }).expect(400);
    await create({ ...input(), participantIds: [ownerId, ownerId] }).expect(400);
    await create({ ...input(), items: [{ name: 'Bad', quantity: 0, unitPriceCents: 10 }] }).expect(400);
    await create({ ...input(), items: [{ name: 'Bad', quantity: 1, unitPriceCents: 1.5 }] }).expect(400);
    await create({ ...input(), splitMode: 'ITEMS' }).expect(400);
    await owner.post(`/api/groups/${groupId}/expenses`).send({ clientRequestId: randomUUID(), expense: { ...input(), totalCents: 1 } }).expect(400);
    expect(await prisma.expense.count({ where: { groupId } })).toBe(before);
  });

  it('persists item assignments and proportional fees, and replaces them atomically on edit', async () => {
    const expenseInput = { ...input(), splitMode: 'ITEMS', taxCents: 100, items: [
      { name: 'Mine', quantity: 1, unitPriceCents: 1000, assignedUserIds: [ownerId] },
      { name: 'Theirs', quantity: 2, unitPriceCents: 1500, assignedUserIds: [memberId] },
    ] };
    const created = await create(expenseInput).expect(201);
    expect(created.body.expense.shares.map((share: { totalCents: number }) => share.totalCents)).toEqual([1025, 3075]);
    expect(created.body.expense.items[1].assignments[0].userId).toBe(memberId);
    const edited = await owner.put(`/api/expenses/${created.body.expense.id}`).send({ version: 1, expense: input() }).expect(200);
    expect(edited.body.expense.items).toHaveLength(1);
    expect(await prisma.itemAssignment.count({ where: { expenseId: created.body.expense.id } })).toBe(0);
  });

  it('tracks sent/issue/confirmed payments, keeps spending unchanged, and protects history', async () => {
    const created = await create().expect(201);
    const id = created.body.expense.id;
    const before = (await owner.get(`/api/groups/${groupId}/balances`).expect(200)).body.balances;
    const key = randomUUID();
    const sent = await member.post(`/api/expenses/${id}/payments`).send({ amountCents: 500, clientRequestId: key }).expect(201);
    const replay = await member.post(`/api/expenses/${id}/payments`).send({ amountCents: 500, clientRequestId: key }).expect(201);
    expect(replay.body.payment.id).toBe(sent.body.payment.id);
    await owner.post(`/api/expenses/${id}/payments`).send({ amountCents: 1, clientRequestId: randomUUID() }).expect(400);
    await outsider.post(`/api/expenses/${id}/payments`).send({ amountCents: 1, clientRequestId: randomUUID() }).expect(404);
    await member.post(`/api/expenses/${id}/payments`).send({ amountCents: 1051, clientRequestId: randomUUID() }).expect(409);
    expect((await owner.get(`/api/groups/${groupId}/balances`)).body.balances).toEqual(before);
    await member.patch(`/api/expenses/${id}/payments/${sent.body.payment.id}`).send({ status: 'CONFIRMED' }).expect(403);
    await owner.patch(`/api/expenses/${id}/payments/${sent.body.payment.id}`).send({ status: 'ISSUE' }).expect(200);
    const replacement = await member.post(`/api/expenses/${id}/payments`).send({ amountCents: 1051, clientRequestId: randomUUID() }).expect(201);
    const url = `/api/expenses/${id}/payments/${replacement.body.payment.id}`;
    await owner.patch(url).send({ status: 'CONFIRMED' }).expect(200);
    await owner.patch(url).send({ status: 'CONFIRMED' }).expect(200);
    await owner.patch(url).send({ status: 'ISSUE' }).expect(409);
    const after = (await owner.get(`/api/groups/${groupId}/balances`).expect(200)).body.balances as { userId: string; spendingCents: number; balanceCents: number }[];
    expect(after.reduce((sum, value) => sum + value.balanceCents, 0)).toBe(0);
    for (const value of after) {
      const old = before.find((entry: { userId: string }) => entry.userId === value.userId);
      expect(value.spendingCents).toBe(old.spendingCents);
      expect(value.balanceCents - old.balanceCents).toBe(value.userId === memberId ? 1051 : -1051);
    }
    await owner.put(`/api/expenses/${id}`).send({ version: 1, expense: input() }).expect(409);
    await member.delete('/api/users/me').expect(409);
    expect(await prisma.user.findUnique({ where: { id: memberId } })).not.toBeNull();
  });

  it('keeps the creator separate from the payer and gives payment authority to the payer', async () => {
    const created = await create({ ...input(), paidByUserId: memberId }).expect(201);
    const expense = created.body.expense;
    expect(expense.createdByUserId).toBe(ownerId);
    expect(expense.paidByUserId).toBe(memberId);
    await member.put(`/api/expenses/${expense.id}`).send({ version: 1, expense: { ...input(), paidByUserId: memberId } }).expect(200);
    const sent = await owner.post(`/api/expenses/${expense.id}/payments`).send({ amountCents: 1052, clientRequestId: randomUUID() }).expect(201);
    await owner.patch(`/api/expenses/${expense.id}/payments/${sent.body.payment.id}`).send({ status: 'CONFIRMED' }).expect(403);
    await member.patch(`/api/expenses/${expense.id}/payments/${sent.body.payment.id}`).send({ status: 'CONFIRMED' }).expect(200);
  });

  it('prevents competing payment reports from exceeding the share', async () => {
    const created = await create().expect(201);
    const responses = await Promise.all([1, 2].map(() => member.post(`/api/expenses/${created.body.expense.id}/payments`).send({ amountCents: 1051, clientRequestId: randomUUID() })));
    expect(responses.map(value => value.status).sort()).toEqual([201, 409]);
    const records = await prisma.expensePayment.findMany({ where: { expenseId: created.body.expense.id } });
    expect(records).toHaveLength(1);
    expect(records[0]?.amountCents).toBe(1051);
  });

  it('blocks deletion and unpaid member removal, preserving history after settlement and removal', async () => {
    const createdGroup = await owner.post('/api/groups').send({ name: 'History', memberIds: [memberId] }).expect(201);
    const id = createdGroup.body.group.id;
    groupIds.push(id);
    const created = await owner.post(`/api/groups/${id}/expenses`).send({ expense: input(), clientRequestId: randomUUID() }).expect(201);
    const expenseId = created.body.expense.id;
    await owner.delete(`/api/groups/${id}`).expect(409);
    await owner.delete('/api/users/me').expect(409);
    await owner.delete(`/api/groups/${id}/members/${memberId}`).expect(409);
    await member.delete(`/api/groups/${id}/members/${memberId}`).expect(409);
    const sent = await member.post(`/api/expenses/${expenseId}/payments`).send({ amountCents: 1051, clientRequestId: randomUUID() }).expect(201);
    await owner.delete(`/api/groups/${id}/members/${memberId}`).expect(409);
    await owner.patch(`/api/expenses/${expenseId}/payments/${sent.body.payment.id}`).send({ status: 'CONFIRMED' }).expect(200);
    await owner.delete(`/api/groups/${id}/members/${memberId}`).expect(204);
    await member.get(`/api/expenses/${expenseId}`).expect(404);
    const loaded = await owner.get(`/api/expenses/${expenseId}`).expect(200);
    expect(loaded.body.expense.shares).toEqual(expect.arrayContaining([expect.objectContaining({ userId: memberId, totalCents: 1051 })]));
    const balances = await owner.get(`/api/groups/${id}/balances`).expect(200);
    expect(balances.body.balances.every((row: { balanceCents: number }) => row.balanceCents === 0)).toBe(true);
  });

  it('serializes competing edits so only one version wins', async () => {
    const created = await create().expect(201);
    const id = created.body.expense.id;
    const responses = await Promise.all(['First edit', 'Second edit'].map(title => owner.put(`/api/expenses/${id}`).send({ version: 1, expense: { ...input(), title } })));
    expect(responses.map(value => value.status).sort()).toEqual([200, 409]);
    const expense = await prisma.expense.findUniqueOrThrow({ where: { id }, include: { shares: true } });
    expect(expense.version).toBe(2);
    expect(expense.shares.reduce((sum, share) => sum + share.totalCents, 0)).toBe(expense.totalCents);
  });
});
