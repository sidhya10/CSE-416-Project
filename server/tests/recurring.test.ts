import { lockMaintenance } from '../src/utils/maintenance-lock.js';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { runMaintenance } from '../src/modules/recurring/recurring.service.js';
const owner = request.agent(app), member = request.agent(app), outsider = request.agent(app);
const userIds: string[] = [], groups: string[] = [];
const run = randomUUID().slice(0, 8);
beforeAll(async () => {
  for (const [index, agent] of [owner, member, outsider].entries()) {
    const response = await agent.post('/api/auth/register').send({ name: `Schedule ${index}`, email: `sched-${index}-${run}@example.com`, username: `sched_${index}_${run}`, password: 'password1' });
    expect(response.status).toBe(201); userIds.push(response.body.user.id);
  }
});
afterAll(async () => {
  await prisma.$transaction(async tx => {
    await lockMaintenance(tx);
    const expenses = await tx.expense.findMany({ where: { groupId: { in: groups } }, select: { id: true } });
    await tx.expensePayment.deleteMany({ where: { expenseId: { in: expenses.map(x => x.id) } } });
    await tx.expense.deleteMany({ where: { groupId: { in: groups } } });
    await tx.group.deleteMany({ where: { id: { in: groups } } });
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
  });
  await prisma.$disconnect();
});
async function group() {
  const response = await owner.post('/api/groups').send({ name: 'Recurring bills', type: 'Recurring', memberIds: [userIds[1]] });
  expect(response.status).toBe(201); groups.push(response.body.group.id); return response.body.group.id as string;
}
const plan = () => ({ payerId: userIds[0]!, shares: { [userIds[0]!]: 4000, [userIds[1]!]: 6000 } });
const template = () => ({ title: 'Utilities', amountCents: 10000, startDate: '2030-01-31', frequency: 'Monthly', defaultPlan: plan() });
describe('persistent recurring generation', () => {
  it('generates due cycles exactly once, catches up, clamps dates and applies per-cycle overrides', async () => {
    const id = await group();
    const created = await owner.post(`/api/groups/${id}/recurring`).send(template()); expect(created.status).toBe(201);
    const billId = created.body.bill.id as string;
    await outsider.get(`/api/groups/${id}/recurring`).expect(404);
    await outsider.patch(`/api/recurring/${billId}`).send({ paused: true }).expect(404);
    const override = { payerId: userIds[1]!, shares: { [userIds[0]!]: 7000, [userIds[1]!]: 3000 } };
    await member.put(`/api/recurring/${billId}/cycles/1`).send(override).expect(204);
    await prisma.group.update({ where: { id }, data: { lastActivityAt: new Date('2030-03-01') } });
    await Promise.all([runMaintenance(new Date('2030-03-01'), id), runMaintenance(new Date('2030-03-01'), id)]);
    const expenses = await prisma.expense.findMany({ where: { recurringBillId: billId }, orderBy: { cycleDate: 'asc' }, include: { shares: true } });
    expect(expenses.map(x => x.cycleDate!.toISOString().slice(0, 10))).toEqual(['2030-01-31', '2030-02-28']);
    expect(expenses[1]!.paidByUserId).toBe(userIds[1]);
    expect(expenses[1]!.shares.find(x => x.userId === userIds[0])!.totalCents).toBe(7000);
    const next = await prisma.recurringBill.findUniqueOrThrow({ where: { id: billId } }); expect(next.nextCycle).toBe(2);
    await member.put(`/api/recurring/${billId}/cycles/0`).send(override).expect(204);
    const updated = await prisma.expense.findUniqueOrThrow({ where: { id: expenses[0]!.id } }); expect(updated.paidByUserId).toBe(userIds[1]);
    const sent = await owner.post(`/api/expenses/${updated.id}/payments`).send({ amountCents: 7000, clientRequestId: randomUUID() }); expect(sent.status).toBe(201);
    await member.put(`/api/recurring/${billId}/cycles/0`).send(plan()).expect(409);
    const balances = await owner.get(`/api/groups/${id}/balances`); expect(balances.status).toBe(200);
    expect(balances.body.balances.reduce((sum: number, value: { balanceCents: number }) => sum + value.balanceCents, 0)).toBe(0);
  });
  it('validates plans, schedules, permissions and pauses invalid memberships without losing cycles', async () => {
    const id = await group();
    await outsider.post(`/api/groups/${id}/recurring`).send(template()).expect(404);
    await owner.post(`/api/groups/${id}/recurring`).send({ ...template(), defaultPlan: { ...plan(), shares: { [userIds[0]!]: 1 } } }).expect(400);
    await owner.post(`/api/groups/${id}/recurring`).send({ ...template(), defaultPlan: { payerId: userIds[2], shares: { [userIds[2]!]: 10000 } } }).expect(400);
    await owner.post(`/api/groups/${id}/recurring`).send({ ...template(), frequency: 'Custom', customEvery: 0 }).expect(400);
    const created = await owner.post(`/api/groups/${id}/recurring`).send(template()); const billId = created.body.bill.id;
    await owner.patch(`/api/recurring/${billId}`).send({ paused: true }).expect(200);
    await prisma.group.update({ where: { id }, data: { lastActivityAt: new Date('2030-02-01') } });
    await runMaintenance(new Date('2030-02-01'), id); expect(await prisma.expense.count({ where: { groupId: id } })).toBe(0);
    await member.patch(`/api/recurring/${billId}`).send({ paused: false }).expect(200);
    await prisma.groupMembership.delete({ where: { groupId_userId: { groupId: id, userId: userIds[1]! } } });
    await prisma.group.update({ where: { id }, data: { lastActivityAt: new Date('2030-02-01') } });
    await runMaintenance(new Date('2030-02-01'), id);
    const bill = await prisma.recurringBill.findUniqueOrThrow({ where: { id: billId } }); expect(bill.paused).toBe(true); expect(bill.nextCycle).toBe(0);
    await owner.patch(`/api/recurring/${billId}`).send({ defaultPlan: { payerId: userIds[0], shares: { [userIds[0]!]: 10000 } }, paused: false }).expect(200);
    await prisma.group.update({ where: { id }, data: { lastActivityAt: new Date('2030-02-01') } });
    await runMaintenance(new Date('2030-02-01'), id); expect(await prisma.expense.count({ where: { groupId: id } })).toBe(1);
  });
  it.each(['Weekly', 'Monthly', 'Quarterly', 'Semi-yearly', 'Yearly', 'Custom'])('persists %s frequency and generates a currently due first expense', async frequency => {
    const id = await group();
    const result = await owner.post(`/api/groups/${id}/recurring`).send({ ...template(), startDate: new Date().toISOString().slice(0, 10), frequency, customEvery: 2, customUnit: 'weeks' });
    expect(result.status).toBe(201);
    expect(result.body.bill.frequency).toBe(frequency);
    await runMaintenance(new Date(), id);
    expect(await prisma.expense.count({ where: { groupId: id } })).toBe(1);
  });
  it('pauses archived schedules and catches up on restore without duplicating expenses', async () => {
    const id = await group();
    const result = await owner.post(`/api/groups/${id}/recurring`).send(template()); expect(result.status).toBe(201);
    await member.post(`/api/groups/${id}/archive`).send({ archived: true }).expect(200);
    await runMaintenance(new Date('2030-03-01'), id); expect(await prisma.expense.count({ where: { groupId: id } })).toBe(0);
    await member.post(`/api/groups/${id}/archive`).send({ archived: false }).expect(200);
    await prisma.group.update({ where: { id }, data: { lastActivityAt: new Date('2030-03-01') } });
    await runMaintenance(new Date('2030-03-01'), id); expect(await prisma.expense.count({ where: { groupId: id } })).toBe(2);
    await runMaintenance(new Date('2030-03-01'), id); expect(await prisma.expense.count({ where: { groupId: id } })).toBe(2);
  });
  it('keeps zero-net unresolved groups first and applies API search, friend, date and amount filters', async () => {
    const id = await group();
    for (const payer of [userIds[0]!, userIds[1]!]) await prisma.expense.create({ data: {
      groupId: id, createdByUserId: userIds[0]!, paidByUserId: payer, title: 'Offsetting shares', expenseDate: new Date(), splitMode: 'CUSTOM', totalCents: 10000, clientRequestId: randomUUID(),
      shares: { create: userIds.slice(0, 2).map((userId, position) => ({ userId, position, baseCents: userId === payer ? 0 : 10000, totalCents: userId === payer ? 0 : 10000 })) },
    } });
    const list = await owner.get('/api/groups').query({ query: 'Recurring bills', friendId: userIds[1], balance: 'unresolved', minAmount: 100, maxAmount: 100, createdAfter: new Date().toISOString().slice(0, 10) });
    expect(list.status).toBe(200);
    expect(list.body.groups).toEqual(expect.arrayContaining([expect.objectContaining({ id, hasUnresolved: true, amountOwesCents: 10000, amountOwedCents: 10000 })]));
    const expense = await prisma.expense.findFirstOrThrow({ where: { groupId: id, paidByUserId: userIds[1] } });
    await owner.post(`/api/expenses/${expense.id}/payments`).send({ amountCents: 10000, clientRequestId: randomUUID() }).expect(201);
    expect((await owner.get('/api/groups').query({ balance: 'unresolved' })).body.groups.some((g: { id: string }) => g.id === id)).toBe(true);
    const filtered = await owner.get('/api/groups').query({ friendId: userIds[2], query: 'Recurring bills' }); expect(filtered.body.groups).toEqual([]);
    const sorted = await owner.get('/api/groups').query({ archived: 'active' });
    const unresolvedFlags = sorted.body.groups.map((g: { hasUnresolved: boolean }) => Number(g.hasUnresolved)); expect(unresolvedFlags).toEqual([...unresolvedFlags].sort((a, b) => b - a));
  });
  it('automatically archives after the default 60 days without losing saved data', async () => {
    const id = await group();
    const now = new Date();
    await prisma.group.update({ where: { id }, data: { lastActivityAt: new Date(now.getTime() - 60 * 86_400_000) } });
    await runMaintenance(now, id);
    expect((await owner.get('/api/groups').query({ archived: 'archived' })).body.groups).toEqual(expect.arrayContaining([expect.objectContaining({ id, archiveReason: 'INACTIVE' })]));
    await member.post(`/api/groups/${id}/archive`).send({ archived: false }).expect(200);
    expect(await prisma.groupMembership.count({ where: { groupId: id } })).toBe(2);
  });
  it('archives at the configured inactivity threshold, distinguishes access from activity and rejects outsiders', async () => {
    const id = await group();
    expect((await owner.get(`/api/groups/${id}`)).body.group.inactivityDays).toBe(60);
    await outsider.post(`/api/groups/${id}/archive`).send({ archived: true }).expect(404);
    await member.patch(`/api/groups/${id}`).send({ inactivityDays: 10 }).expect(403);
    await owner.patch(`/api/groups/${id}`).send({ inactivityDays: 0 }).expect(400);
    await owner.patch(`/api/groups/${id}`).send({ inactivityDays: 10 }).expect(200);
    const last = new Date('2030-01-01T00:00:00Z'); await prisma.group.update({ where: { id }, data: { lastActivityAt: last } });
    await member.get(`/api/groups/${id}`).expect(200);
    expect((await prisma.group.findUniqueOrThrow({ where: { id } })).lastActivityAt).toEqual(last);
    expect((await prisma.groupMembership.findUniqueOrThrow({ where: { groupId_userId: { groupId: id, userId: userIds[1]! } } })).lastAccessedAt).not.toBeNull();
    await runMaintenance(new Date('2030-01-10T23:59:59Z'), id); expect((await prisma.group.findUniqueOrThrow({ where: { id } })).archivedAt).toBeNull();
    await runMaintenance(new Date('2030-01-11T00:00:00Z'), id); expect((await prisma.group.findUniqueOrThrow({ where: { id } })).archiveReason).toBe('INACTIVE');
    await member.post(`/api/groups/${id}/archive`).send({ archived: false }).expect(200);
    expect((await owner.get('/api/groups').query({ archived: 'active' })).body.groups.some((g: { id: string }) => g.id === id)).toBe(true);
    await owner.delete(`/api/groups/${id}`).expect(204);
  });
});
