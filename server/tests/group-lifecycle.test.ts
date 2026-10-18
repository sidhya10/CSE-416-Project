import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { runMaintenance } from '../src/modules/recurring/recurring.service.js';
const owner = request.agent(app), member = request.agent(app), observer = request.agent(app), outsider = request.agent(app);
const ids: string[] = [], groups: string[] = [];
const run = randomUUID().slice(0, 8);
beforeAll(async () => {
  for (const [index, agent] of [owner, member, observer, outsider].entries()) {
    const response = await agent.post('/api/auth/register').send({ name: `Lifecycle ${index}`, email: `lifecycle-${index}-${run}@example.com`, username: `life_${index}_${run}`, password: 'password1' }).expect(201);
    ids.push(response.body.user.id);
  }
});
afterAll(async () => {
  await prisma.expensePayment.deleteMany({ where: { share: { expense: { groupId: { in: groups } } } } });
  await prisma.expense.deleteMany({ where: { groupId: { in: groups } } });
  await prisma.group.deleteMany({ where: { id: { in: groups } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});
async function group(type = 'General') {
  const created = await owner.post('/api/groups').send({ name: 'Lifecycle', type, memberIds: [ids[1], ids[2]] }).expect(201);
  groups.push(created.body.group.id); return created.body.group.id as string;
}
async function expense(groupId: string, payer = ids[0]!, participants = [ids[0]!, ids[1]!], expectedStatus = 201) {
  const created = await owner.post(`/api/groups/${groupId}/expenses`).send({ clientRequestId: randomUUID(), expense: {
    title: 'Shared', expenseDate: new Date().toISOString().slice(0, 10), paidByUserId: payer,
    splitMode: 'EQUAL', participantIds: participants, items: [{ name: 'Shared item', quantity: 1, unitPriceCents: 2000, assignedUserIds: [] }], taxCents: 0, tipCents: 0, otherCents: 0,
  } }).expect(expectedStatus);
  return created.body.expense?.id as string;
}
async function send(expenseId: string, agent = member, amountCents = 1000) {
  return (await agent.post(`/api/expenses/${expenseId}/payments`).send({ amountCents, clientRequestId: randomUUID() }).expect(201)).body.payment.id as string;
}
it('rejects manual and automatic archives for every unpaid, pending, issue and partial share, including observer views', async () => {
  const id = await group(), expenseId = await expense(id);
  const checkBlocked = async () => {
    await observer.post(`/api/groups/${id}/archive`).send({ archived: true }).expect(409);
    const view = await observer.get(`/api/groups/${id}`).expect(200);
    expect(view.body.group).toMatchObject({ hasUnresolved: false, canArchive: false, archivedAt: null });
    const now = new Date();
    await prisma.group.update({ where: { id }, data: { lastActivityAt: new Date(now.getTime() - 70 * 86400000) } });
    await runMaintenance(now, id);
    expect((await prisma.group.findUniqueOrThrow({ where: { id } })).archivedAt).toBeNull();
  };
  await checkBlocked();
  const pending = await send(expenseId, member, 400); await checkBlocked();
  await owner.patch(`/api/expenses/${expenseId}/payments/${pending}`).send({ status: 'ISSUE' }).expect(200); await checkBlocked();
  const partial = await send(expenseId, member, 400);
  await owner.patch(`/api/expenses/${expenseId}/payments/${partial}`).send({ status: 'CONFIRMED' }).expect(200); await checkBlocked();
  const rest = await send(expenseId, member, 600);
  await owner.patch(`/api/expenses/${expenseId}/payments/${rest}`).send({ status: 'CONFIRMED' }).expect(200);
  await observer.post(`/api/groups/${id}/archive`).send({ archived: true }).expect(200);
  expect((await member.get(`/api/groups/${id}`).expect(200)).body.group.archivedAt).not.toBeNull();
  await member.post(`/api/groups/${id}/archive`).send({ archived: false }).expect(200);
  const now = new Date(); await prisma.group.update({ where: { id }, data: { lastActivityAt: new Date(now.getTime() - 70 * 86400000) } });
  await runMaintenance(now, id);
  expect((await prisma.group.findUniqueOrThrow({ where: { id } })).archiveReason).toBe('INACTIVE');
  await expense(id, ids[0]!, [ids[0]!, ids[1]!], 409);
});
it('does not treat offsetting debts as settled', async () => {
  const id = await group(); await expense(id); await expense(id, ids[1]);
  const view = await owner.get(`/api/groups/${id}`).expect(200);
  expect(view.body.group.amountOwedCents).toBe(view.body.group.amountOwesCents);
  expect(view.body.group.canArchive).toBe(false);
  await owner.post(`/api/groups/${id}/archive`).send({ archived: true }).expect(409);
});
it('permanently deletes group history and access for everyone, while preserving unrelated groups', async () => {
  const id = await group('Recurring'), keep = await group();
  const expenseId = await expense(id); await send(expenseId);
  await prisma.expenseReceipt.create({ data: { expenseId, name: 'test.jpg', mimeType: 'image/jpeg', data: new Uint8Array([1, 2, 3]) } });
  await prisma.groupBudgetPlan.create({ data: { groupId: id, plannedCents: 10000 } });
  await owner.post(`/api/groups/${id}/recurring`).send({ title: 'Schedule', amountCents: 1000, startDate: '2090-01-01', frequency: 'Monthly', defaultPlan: { payerId: ids[0], shares: { [ids[0]!]: 500, [ids[1]!]: 500 } } }).expect(201);
  await request(app).delete(`/api/groups/${id}`).expect(401);
  await outsider.delete(`/api/groups/${id}`).expect(404);
  await member.delete(`/api/groups/${id}`).expect(403);
  await owner.post(`/api/groups/${id}/invitations`).send({ userIds: [ids[2]], role: 'ADMIN' }).expect(201);
  await observer.delete(`/api/groups/${id}`).expect(403);
  await owner.delete(`/api/groups/${id}`).expect(204);
  for (const agent of [owner, member, observer]) {
    await agent.get(`/api/groups/${id}`).expect(404);
    await agent.get(`/api/expenses/${expenseId}`).expect(404);
    expect((await agent.get('/api/groups').expect(200)).body.groups.some((g: { id: string }) => g.id === id)).toBe(false);
  }
  expect(await prisma.expensePayment.count({ where: { expenseId } })).toBe(0);
  expect(await prisma.expenseItem.count({ where: { expenseId } })).toBe(0);
  expect(await prisma.expenseShare.count({ where: { expenseId } })).toBe(0);
  expect(await prisma.expenseReceipt.count({ where: { expenseId } })).toBe(0);
  expect(await prisma.recurringBill.count({ where: { groupId: id } })).toBe(0);
  expect(await prisma.groupBudgetPlan.count({ where: { groupId: id } })).toBe(0);
  expect(await prisma.groupInvitation.count({ where: { groupId: id } })).toBe(0);
  expect(await prisma.groupMembership.count({ where: { groupId: id } })).toBe(0);
  await owner.get(`/api/groups/${keep}`).expect(200);
});
it('saves the next plan over legacy overrides without rewriting past paid expenses or changing recurrence', async () => {
  const id = await group('Recurring');
  const created = await owner.post(`/api/groups/${id}/recurring`).send({ title: 'Monthly bill', amountCents: 2000, startDate: new Date().toISOString().slice(0, 10), frequency: 'Monthly', defaultPlan: { payerId: ids[0], shares: { [ids[0]!]: 1000, [ids[1]!]: 1000 } } }).expect(201);
  const billId = created.body.bill.id as string;
  const first = await prisma.expense.findFirstOrThrow({ where: { recurringBillId: billId } });
  const paymentId = await send(first.id); await owner.patch(`/api/expenses/${first.id}/payments/${paymentId}`).send({ status: 'CONFIRMED' }).expect(200);
  await member.put(`/api/recurring/${billId}/cycles/1`).send({ payerId: ids[0], shares: { [ids[0]!]: 1200, [ids[1]!]: 800 } }).expect(204);
  const newPlan = { payerId: ids[1], shares: { [ids[0]!]: 600, [ids[1]!]: 1400 } };
  await member.patch(`/api/recurring/${billId}`).send({ defaultPlan: newPlan }).expect(200);
  const bill = await prisma.recurringBill.findUniqueOrThrow({ where: { id: billId } });
  expect(bill.startDate.toISOString().slice(0, 10)).toBe(created.body.bill.startDate);
  expect([bill.intervalEvery, bill.intervalUnit]).toEqual([1, 'months']);
  expect(await prisma.recurringCycle.count({ where: { billId, index: { gte: 1 } } })).toBe(0);
  const nextDate = new Date(first.expenseDate); nextDate.setUTCMonth(nextDate.getUTCMonth() + 1); nextDate.setUTCDate(28);
  await runMaintenance(nextDate, id);
  const expenses = await prisma.expense.findMany({ where: { recurringBillId: billId }, include: { shares: true }, orderBy: { cycleDate: 'asc' } });
  expect(expenses[0]!.paidByUserId).toBe(ids[0]);
  expect(expenses[0]!.shares.find(s => s.userId === ids[1])!.totalCents).toBe(1000);
  expect(expenses[1]!.paidByUserId).toBe(ids[1]);
  expect(expenses[1]!.shares.find(s => s.userId === ids[0])!.totalCents).toBe(600);
  await request(app).delete(`/api/recurring/${billId}`).expect(401);
  await outsider.delete(`/api/recurring/${billId}`).expect(404);
  await member.delete(`/api/recurring/${billId}`).expect(204);
  expect(await prisma.recurringCycle.count({ where: { billId } })).toBe(0);
  expect(await prisma.expense.count({ where: { groupId: id } })).toBe(2);
  expect(await prisma.expensePayment.count({ where: { id: paymentId, status: 'CONFIRMED' } })).toBe(1);
  expect((await prisma.expense.findUniqueOrThrow({ where: { id: first.id } })).recurringBillId).toBeNull();
  await runMaintenance(new Date('2031-01-01'), id);
  expect(await prisma.expense.count({ where: { groupId: id } })).toBe(2);
});
