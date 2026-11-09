import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
const run = Date.now().toString(36);
const owner = request.agent(app), stranger = request.agent(app);
let userId: string, memberId: string, groupId: string;
const photo = `data:image/png;base64,${Buffer.alloc(120_000, 1).toString('base64')}`;
beforeAll(async () => {
  for (const [index, agent] of [owner, stranger].entries()) {
    const result = await agent.post('/api/auth/register').send({ name: 'Transfer tester', email: `transfer-${run}-${index}@example.com`, username: `transfer_${run}_${index}`, phone: `+1213${String(Date.now() + index).slice(-7)}`, password: 'password1' }).expect(201);
    if (!index) userId = result.body.user.id;
  }
  await prisma.user.update({ where: { id: userId }, data: { photoUrl: photo } });
  memberId = (await prisma.user.create({ data: { name: 'Member', email: `transfer-${run}-member@example.com`, username: `transfer_${run}_member` } })).id;
  const result = await owner.post('/api/groups').send({ name: 'Transfer group', memberIds: [memberId], photoUrl: photo }).expect(201);
  groupId = result.body.group.id;
  for (let index = 0; index < 35; index++) {
    await prisma.expense.create({ data: { groupId, createdByUserId: userId, paidByUserId: userId, clientRequestId: `history-${run}-${index}`, title: `Past ${index}`, expenseDate: new Date(), totalCents: 100, splitMode: 'EQUAL', shares: { create: { userId, baseCents: 100, totalCents: 100, position: 0 } } } });
  }
  for (let index = 0; index < 31; index++) {
    await prisma.expense.create({ data: { groupId, createdByUserId: userId, paidByUserId: userId, clientRequestId: `open-${run}-${index}`, title: `Open ${index}`, expenseDate: new Date(), totalCents: 100, splitMode: 'EQUAL', shares: { create: [{ userId, baseCents: 50, totalCents: 50, position: 0 }, { userId: memberId, baseCents: 50, totalCents: 50, position: 1 }] } } });
  }
});
afterAll(async () => {
  if (groupId) { await prisma.expense.deleteMany({ where: { groupId } }); await prisma.group.delete({ where: { id: groupId } }); }
  await prisma.user.deleteMany({ where: { email: { startsWith: `transfer-${run}-` } } }); await prisma.$disconnect();
});
it('separates inline photos from repeatedly fetched group metadata and protects group photos', async () => {
  const list = await owner.get('/api/groups').expect(200);
  expect(list.text).not.toContain(photo);
  expect(list.body.groups[0].photoUrl).toContain(`/api/groups/${groupId}/photo`);
  expect(list.text.length).toBeLessThan(5000);
  const image = await owner.get(`/api/groups/${groupId}/photo`).expect(200);
  expect(image.headers['cache-control']).toBe('private, max-age=3600');
  await owner.get(`/api/groups/${groupId}/photo`).set('If-None-Match', image.headers.etag!).expect(304);
  await stranger.get(`/api/groups/${groupId}/photo`).expect(404);
  await request(app).get(`/api/users/${userId}/photo`).expect(401);
});
it('paginates history without dropping or duplicating records and checks membership', async () => {
  const first = await owner.get(`/api/groups/${groupId}/expenses?scope=history&limit=20`).expect(200);
  const second = await owner.get(`/api/groups/${groupId}/expenses`).query({ scope: 'history', limit: 20, cursor: first.body.nextCursor }).expect(200);
  expect(first.body.expenses).toHaveLength(20); expect(second.body.expenses).toHaveLength(15);
  expect(second.body.nextCursor).toBeNull();
  expect(new Set([...first.body.expenses, ...second.body.expenses].map(e => e.id)).size).toBe(35);
  expect((await owner.get(`/api/groups/${groupId}/expenses?scope=open`).expect(200)).body.expenses).toHaveLength(31);
  const balances = await owner.get(`/api/groups/${groupId}/balances`).expect(200);
  expect(balances.body.balances).toEqual(expect.arrayContaining([{ userId, balanceCents: 1550, spendingCents: 5050 }, { userId: memberId, balanceCents: -1550, spendingCents: 1550 }]));
  await stranger.get(`/api/groups/${groupId}/expenses?scope=history`).expect(404);
});
it('counts only the signed-in user’s unread notices without returning message bodies', async () => {
  await prisma.groupNotice.create({ data: { groupId, actorId: userId, recipientId: userId, kind: 'EXPENSE_DELETED', message: 'private message' } });
  const count = await owner.get('/api/settlement-notices/unread-count').expect(200);
  expect(count.body).toEqual({ unread: 1 });
  expect((await stranger.get('/api/settlement-notices/unread-count').expect(200)).body).toEqual({ unread: 0 });
  await request(app).get('/api/settlement-notices/unread-count').expect(401);
});
