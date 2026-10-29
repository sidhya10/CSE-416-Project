import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { refreshCategoryBudgetNotices } from '../src/modules/budgets/budget-notices.js';

const users: string[] = [];
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});
it('creates monthly informational alerts without repeating read or deleted notifications', async () => {
  const agent = request.agent(app), outsider = request.agent(app);
  for (const client of [agent, outsider]) {
    const tag = randomUUID().replaceAll('-', '').slice(0, 16);
    const response = await client.post('/api/auth/register').send({ name: 'Budget alert', username: `alert_${tag}`, email: `${tag}@example.com`, phone: `+1209${String(Date.now()).slice(-7)}`, password: 'password1' }).expect(201);
    users.push(response.body.user.id);
  }
  const userId = users[0]!;
  const connection = await prisma.bankConnection.create({ data: { userId, plaidItemId: randomUUID(), institutionName: 'Test', accessTokenEnc: 'test' } });
  const account = await prisma.bankAccount.create({ data: { connectionId: connection.id, plaidAccountId: randomUUID(), name: 'Checking' } });
  const transaction = await prisma.bankTransaction.create({ data: { accountId: account.id, plaidTransactionId: randomUUID(), amountCents: 1000, date: new Date(), name: 'Dinner', category: 'FOOD_AND_DRINK' } });
  await agent.put('/api/budgets/personal/limits').send({ limits: { dining: 1000 } }).expect(200);
  expect((await agent.get('/api/settlement-notices').expect(200)).body.notices).toEqual([]);
  await prisma.bankTransaction.update({ where: { id: transaction.id }, data: { amountCents: 1500 } });
  await Promise.all([refreshCategoryBudgetNotices(userId), refreshCategoryBudgetNotices(userId)]);
  const response = await agent.get('/api/settlement-notices').expect(200);
  expect(response.body.notices).toHaveLength(1);
  const notice = response.body.notices[0];
  expect(notice).toMatchObject({ kind: 'CATEGORY_OVER_BUDGET', groupId: null, readAt: null });
  expect(notice.message).toContain('$5.00 over');
  expect((await outsider.get('/api/settlement-notices').expect(200)).body.notices).toEqual([]);
  await outsider.post(`/api/settlement-notices/${notice.id}/read`).expect(404);
  await outsider.delete(`/api/settlement-notices/${notice.id}`).expect(404);
  await agent.post(`/api/settlement-notices/${notice.id}/read`).expect(204);
  expect((await agent.get('/api/settlement-notices').expect(200)).body.notices[0].readAt).not.toBeNull();
  await agent.post(`/api/settlement-notices/${notice.id}/unread`).expect(204);
  expect((await agent.get('/api/settlement-notices').expect(200)).body.notices[0].readAt).toBeNull();
  await agent.delete(`/api/settlement-notices/${notice.id}`).expect(204);
  expect((await agent.get('/api/settlement-notices').expect(200)).body.notices).toEqual([]);
  const next = new Date(); next.setUTCMonth(next.getUTCMonth() + 1, 1);
  await prisma.bankTransaction.update({ where: { id: transaction.id }, data: { date: next } });
  await refreshCategoryBudgetNotices(userId, next);
  expect(await prisma.categoryBudgetNotice.count({ where: { recipientId: userId } })).toBe(2);
  await agent.delete('/api/settlement-notices').expect(204);
  expect(await prisma.categoryBudgetNotice.count({ where: { recipientId: userId, deletedAt: null } })).toBe(0);
  await agent.put('/api/budgets/personal/limits').send({ limits: { dining: 0 } }).expect(200);
  const later = new Date(next); later.setUTCMonth(later.getUTCMonth() + 1);
  await prisma.bankTransaction.update({ where: { id: transaction.id }, data: { date: later } });
  await refreshCategoryBudgetNotices(userId, later);
  expect(await prisma.categoryBudgetNotice.count({ where: { recipientId: userId } })).toBe(2);
});
