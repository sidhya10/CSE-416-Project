import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';

const owner = request.agent(app), member = request.agent(app), outsider = request.agent(app);
const userIds: string[] = [];
const groupIds: string[] = [];
let ownerId: string, memberId: string, groupId: string;
const run = randomUUID().replaceAll('-', '').slice(0, 16);

const today = new Date();
const day = (offsetMonths: number, dayOfMonth: number) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offsetMonths, dayOfMonth));
const todayIso = today.toISOString().slice(0, 10);

beforeAll(async () => {
  for (const [index, agent] of [owner, member, outsider].entries()) {
    const result = await agent.post('/api/auth/register').send({ name: `Budget Test ${index}`, username: `bud_${run}_${index}`, email: `bud_${run}_${index}@example.com`, phone: `+1209${String(Date.now() + index).slice(-7)}`, password: 'password1' }).expect(201);
    userIds.push(result.body.user.id);
  }
  [ownerId, memberId] = userIds as [string, string, string];
  await owner.post(`/api/friends/${memberId}`).expect(201);
  const result = await owner.post('/api/groups').send({ name: 'Budget test group', type: 'Trip', startDate: '2026-10-01', endDate: '2026-10-31', memberIds: [memberId] }).expect(201);
  groupId = result.body.group.id;
  groupIds.push(groupId);
});

afterAll(async () => {
  const expenseIds = (await prisma.expense.findMany({ where: { groupId: { in: groupIds } }, select: { id: true } })).map(value => value.id);
  await prisma.expensePayment.deleteMany({ where: { expenseId: { in: expenseIds } } });
  await prisma.expense.deleteMany({ where: { groupId: { in: groupIds } } });
  await prisma.groupMembership.deleteMany({ where: { groupId: { in: groupIds } } });
  await prisma.group.deleteMany({ where: { id: { in: groupIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

type Category = { key: string; plannedCents: number; spentCents: number };
const byKey = (categories: Category[]) => Object.fromEntries(categories.map(category => [category.key, category]));

describe('authentication', () => {
  it('requires a session for every budget route', async () => {
    await request(app).get('/api/budgets/personal').expect(401);
    await request(app).put('/api/budgets/personal/limits').send({ limits: { dining: 1 } }).expect(401);
    await request(app).get('/api/budgets/groups').expect(401);
    await request(app).put(`/api/budgets/groups/${groupId}/plan`).send({ plannedCents: 1 }).expect(401);
  });
});

describe('personal budget', () => {
  it('starts with no limits, no spending and no bank connection', async () => {
    const response = await owner.get('/api/budgets/personal').expect(200);
    expect(response.body).toMatchObject({ hasBankConnection: false, lastSyncedAt: null });
    expect(response.body.categories.map((category: Category) => category.key)).toEqual(['dining', 'groceries', 'transit', 'shopping', 'other']);
    expect(response.body.categories.every((category: Category) => category.plannedCents === 0 && category.spentCents === 0)).toBe(true);
    expect(response.body.daysInMonth).toBeGreaterThanOrEqual(28);
    expect(response.body.daysLeft).toBeGreaterThanOrEqual(0);
  });

  it('adds up this month\'s visible bank spending by category and ignores everything else', async () => {
    const syncedAt = new Date('2026-10-10T12:00:00Z');
    const connection = await prisma.bankConnection.create({ data: { userId: ownerId, plaidItemId: `item-${run}`, institutionName: 'Test Bank', accessTokenEnc: 'not-a-real-token', lastSyncedAt: syncedAt } });
    const shown = await prisma.bankAccount.create({ data: { connectionId: connection.id, plaidAccountId: `shown-${run}`, name: 'Checking' } });
    const hidden = await prisma.bankAccount.create({ data: { connectionId: connection.id, plaidAccountId: `hidden-${run}`, name: 'Savings', hidden: true } });
    const row = (account: { id: string }, id: string, amountCents: number, date: Date, extra: { category?: string | null; name?: string; merchant?: string | null; pending?: boolean } = {}) =>
      ({ accountId: account.id, plaidTransactionId: `${id}-${run}`, amountCents, date, name: extra.name ?? 'Charge', merchant: extra.merchant ?? null, category: extra.category === undefined ? 'FOOD_AND_DRINK' : extra.category, pending: extra.pending ?? false });
    await prisma.bankTransaction.createMany({ data: [
      row(shown, 'dining', 1000, day(0, 1), { merchant: 'Thai Basil' }),
      row(shown, 'grocery', 2000, day(0, 1), { name: "TRADER JOE'S #1", merchant: "Trader Joe's" }),
      row(shown, 'transit', 500, day(0, 1), { category: 'TRANSPORTATION', pending: true }),
      row(shown, 'shop', 3000, day(0, 1), { category: 'GENERAL_MERCHANDISE' }),
      row(shown, 'bills', 700, day(0, 1), { category: 'RENT_AND_UTILITIES' }),
      row(shown, 'unknown', 100, day(0, 1), { category: null }),
      row(shown, 'paycheck', -5000, day(0, 1), { category: 'INCOME' }),
      row(shown, 'refund', -300, day(0, 1), { category: 'GENERAL_MERCHANDISE' }),
      row(shown, 'move', 4000, day(0, 1), { category: 'TRANSFER_OUT' }),
      row(shown, 'last-month', 9999, day(-1, 28)),
      row(shown, 'next-month', 7777, day(1, 1)),
      row(hidden, 'hidden', 8888, day(0, 1)),
    ] });

    const response = await owner.get('/api/budgets/personal').expect(200);
    expect(response.body).toMatchObject({ hasBankConnection: true, lastSyncedAt: syncedAt.getTime() });
    const categories = byKey(response.body.categories);
    expect(Object.fromEntries(Object.entries(categories).map(([key, value]) => [key, value.spentCents]))).toEqual({ dining: 1000, groceries: 2000, transit: 500, shopping: 3000, other: 800 });
    const { transactions } = response.body;
    expect(transactions.dining).toEqual([{ id: expect.any(String), merchant: 'Thai Basil', date: day(0, 1).toISOString().slice(0, 10), amountCents: 1000, pending: false }]);
    expect(transactions.groceries[0]).toMatchObject({ merchant: "Trader Joe's", amountCents: 2000 });
    expect(transactions.transit[0]).toMatchObject({ pending: true });
    expect(transactions.other.map((item: { amountCents: number }) => item.amountCents).sort()).toEqual([100, 700]);
    // Each category's transactions add up to its spending, and nothing leaks to other users.
    for (const [key, value] of Object.entries(categories)) expect(transactions[key].reduce((sum: number, item: { amountCents: number }) => sum + item.amountCents, 0)).toBe(value.spentCents);
    const other = await outsider.get('/api/budgets/personal').expect(200);
    expect(other.body).toMatchObject({ hasBankConnection: false });
    expect(other.body.categories.every((category: Category) => category.spentCents === 0)).toBe(true);
  });

  it('saves limits, updates them in place, and keeps each user\'s limits private', async () => {
    const saved = await owner.put('/api/budgets/personal/limits').send({ limits: { dining: 36500, other: 0 } }).expect(200);
    expect(byKey(saved.body.categories).dining).toMatchObject({ plannedCents: 36500, spentCents: 1000 });
    expect(byKey(saved.body.categories).groceries.plannedCents).toBe(0);
    const updated = await owner.put('/api/budgets/personal/limits').send({ limits: { dining: 40000, groceries: 35000 } }).expect(200);
    expect(byKey(updated.body.categories)).toMatchObject({ dining: { plannedCents: 40000 }, groceries: { plannedCents: 35000 } });
    expect(await prisma.categoryLimit.count({ where: { userId: ownerId, category: 'dining' } })).toBe(1);
    const reloaded = await owner.get('/api/budgets/personal').expect(200);
    expect(byKey(reloaded.body.categories).dining.plannedCents).toBe(40000);
    const other = await member.get('/api/budgets/personal').expect(200);
    expect(other.body.categories.every((category: Category) => category.plannedCents === 0)).toBe(true);
  });

  it('rejects invalid limit requests without changing anything', async () => {
    for (const body of [
      {}, { limits: {} }, { limits: { dining: -1 } }, { limits: { dining: 100_000_001 } }, { limits: { dining: 12.5 } },
      { limits: { dining: '100' } }, { limits: { travel: 100 } }, { limits: { dining: 100 }, extra: true },
    ]) await owner.put('/api/budgets/personal/limits').send(body).expect(400);
    await owner.put('/api/budgets/personal/limits').send({ limits: { dining: 100_000_000 } }).expect(200);
    await owner.put('/api/budgets/personal/limits').send({ limits: { dining: 40000 } }).expect(200);
    // Rows from the earlier tests only: dining, groceries, and other. The rejected requests added none.
    expect(await prisma.categoryLimit.count({ where: { userId: ownerId } })).toBe(3);
    expect(await prisma.categoryLimit.findUniqueOrThrow({ where: { userId_category: { userId: ownerId, category: 'dining' } } })).toMatchObject({ limitCents: 40000 });
  });
});

describe('group budgets', () => {
  let expenseId: string;

  it('counts this month\'s group spending and who owes whom from the expense ledger', async () => {
    const created = await owner.post(`/api/groups/${groupId}/expenses`).send({ clientRequestId: randomUUID(), expense: {
      title: 'Cabin', expenseDate: todayIso, paidByUserId: ownerId, splitMode: 'EQUAL', participantIds: [ownerId, memberId],
      items: [{ name: 'Cabin', unitPriceCents: 10000, quantity: 1 }], taxCents: 0, tipCents: 0, otherCents: 0 } }).expect(201);
    expenseId = created.body.expense.id;
    // An older expense must not count toward this month's spending, though any balance it leaves still counts.
    await owner.post(`/api/groups/${groupId}/expenses`).send({ clientRequestId: randomUUID(), expense: {
      title: 'Old', expenseDate: day(-2, 1).toISOString().slice(0, 10), paidByUserId: ownerId, splitMode: 'EQUAL', participantIds: [ownerId, memberId],
      items: [{ name: 'Old', unitPriceCents: 2000, quantity: 1 }], taxCents: 0, tipCents: 0, otherCents: 0 } }).expect(201);

    const forOwner = (await owner.get('/api/budgets/groups').expect(200)).body.groups.find((group: { id: string }) => group.id === groupId);
    expect(forOwner).toMatchObject({ name: 'Budget test group', type: 'Trip', memberCount: 2, spentCents: 10000, plannedCents: 0, canEditPlan: true });
    expect(forOwner.members).toEqual([
      { id: ownerId, name: 'Budget Test 0', isYou: true, paidCents: 10000, owesCents: 0, owedCents: 6000 },
      { id: memberId, name: 'Budget Test 1', isYou: false, paidCents: 0, owesCents: 6000, owedCents: 0 },
    ]);
    const forMember = (await member.get('/api/budgets/groups').expect(200)).body.groups.find((group: { id: string }) => group.id === groupId);
    expect(forMember).toMatchObject({ canEditPlan: false, spentCents: 10000 });
    expect(forMember.members[0]).toMatchObject({ id: memberId, isYou: true, owesCents: 6000 });
    const none = (await outsider.get('/api/budgets/groups').expect(200)).body.groups;
    expect(none.map((group: { id: string }) => group.id)).not.toContain(groupId);
  });

  it('only counts confirmed payments toward settling up', async () => {
    const sent = await member.post(`/api/expenses/${expenseId}/payments`).send({ amountCents: 5000, clientRequestId: randomUUID() }).expect(201);
    const find = async () => (await member.get('/api/budgets/groups').expect(200)).body.groups.find((group: { id: string }) => group.id === groupId);
    expect((await find()).members.find((m: { isYou: boolean }) => m.isYou).owesCents).toBe(6000);
    await owner.patch(`/api/expenses/${expenseId}/payments/${sent.body.payment.id}`).send({ status: 'CONFIRMED' }).expect(200);
    expect((await find()).members.find((m: { isYou: boolean }) => m.isYou).owesCents).toBe(1000);
  });

  it('lets only owners and admins set the shared plan', async () => {
    await member.put(`/api/budgets/groups/${groupId}/plan`).send({ plannedCents: 90000 }).expect(403);
    await outsider.put(`/api/budgets/groups/${groupId}/plan`).send({ plannedCents: 90000 }).expect(404);
    await owner.put('/api/budgets/groups/does-not-exist/plan').send({ plannedCents: 90000 }).expect(404);
    for (const body of [{}, { plannedCents: -1 }, { plannedCents: 100_000_001 }, { plannedCents: 1.5 }, { plannedCents: '5' }, { plannedCents: 5, extra: 1 }]) {
      await owner.put(`/api/budgets/groups/${groupId}/plan`).send(body).expect(400);
    }
    const saved = await owner.put(`/api/budgets/groups/${groupId}/plan`).send({ plannedCents: 90000 }).expect(200);
    expect(saved.body.groups.find((group: { id: string }) => group.id === groupId)).toMatchObject({ plannedCents: 90000 });
    const updated = await owner.put(`/api/budgets/groups/${groupId}/plan`).send({ plannedCents: 0 }).expect(200);
    expect(updated.body.groups.find((group: { id: string }) => group.id === groupId)).toMatchObject({ plannedCents: 0 });
    expect(await prisma.groupBudgetPlan.count({ where: { groupId } })).toBe(1);
    const asMember = await member.get('/api/budgets/groups').expect(200);
    expect(asMember.body.groups.find((group: { id: string }) => group.id === groupId).plannedCents).toBe(0);
  });

  it('leaves archived groups out until they are restored', async () => {
    const created = await owner.post('/api/groups').send({ name: 'Settled archive', memberIds: [memberId] }).expect(201);
    const archiveId = created.body.group.id; groupIds.push(archiveId);
    await owner.post(`/api/groups/${archiveId}/archive`).send({ archived: true }).expect(200);
    expect((await owner.get('/api/budgets/groups').expect(200)).body.groups.map((group: { id: string }) => group.id)).not.toContain(archiveId);
    await owner.post(`/api/groups/${archiveId}/archive`).send({ archived: false }).expect(200);
    expect((await owner.get('/api/budgets/groups').expect(200)).body.groups.map((group: { id: string }) => group.id)).toContain(archiveId);
  });
});

describe('home summary', () => {
  const monthKey = (offset: number) => day(offset, 1).toISOString().slice(0, 7);

  it('requires a session', async () => {
    await request(app).get('/api/budgets/home').expect(401);
  });

  it('reports four months of spending and income from visible bank accounts', async () => {
    const { body } = await owner.get('/api/budgets/home').expect(200);
    expect(body.history.map((month: { month: string }) => month.month)).toEqual([monthKey(-3), monthKey(-2), monthKey(-1), monthKey(0)]);
    // Seeded earlier: spending excludes the transfer, refund, hidden account and next month; income is only the INCOME deposit.
    // The owner also fronted the cabin and was repaid $50.00 by then, whose own $50 share counts regardless of repayment.
    expect(body.history[3]).toEqual({ month: monthKey(0), spendingCents: 7300 + 5000, incomeCents: 5000 });
    expect(body.history[2]).toEqual({ month: monthKey(-1), spendingCents: 9999, incomeCents: 0 });
    expect(body.history[0]).toEqual({ month: monthKey(-3), spendingCents: 0, incomeCents: 0 });
    const other = await outsider.get('/api/budgets/home').expect(200);
    expect(other.body.history.every((month: { spendingCents: number; incomeCents: number }) => month.spendingCents === 0 && month.incomeCents === 0)).toBe(true);
  });

  it('counts payments waiting for the payer to confirm and reports the latest group expense', async () => {
    const before = await owner.get('/api/budgets/home').expect(200);
    expect(before.body.pendingPayments).toEqual({ count: 0, cents: 0 });
    const expenses = await owner.get(`/api/groups/${groupId}/expenses`).expect(200);
    // The member's share of Cabin is already fully paid; Old still has an unpaid $10 share.
    const old = expenses.body.expenses.find((expense: { title: string }) => expense.title === 'Old');
    await member.post(`/api/expenses/${old.id}/payments`).send({ amountCents: 1000, clientRequestId: randomUUID() }).expect(201);
    const owed = await owner.get('/api/budgets/home').expect(200);
    expect(owed.body.pendingPayments).toEqual({ count: 1, cents: 1000 });
    expect(owed.body.latestExpense).toMatchObject({ title: 'Old', groupName: 'Budget test group', creatorName: 'Budget Test 0', isYou: true, totalCents: 2000 });
    const sender = await member.get('/api/budgets/home').expect(200);
    expect(sender.body.pendingPayments).toEqual({ count: 0, cents: 0 });
    expect(sender.body.latestExpense).toMatchObject({ isYou: false });
    expect((await outsider.get('/api/budgets/home').expect(200)).body.latestExpense).toBeNull();
  });
});

describe('personal budget and group settlements', () => {
  it('counts shares once regardless of whether repayments are sent, confirmed, or flagged', async () => {
    const created = await owner.post(`/api/groups/${groupId}/expenses`).send({ clientRequestId: randomUUID(), expense: {
      title: 'Settle me', expenseDate: todayIso, paidByUserId: ownerId, splitMode: 'EQUAL', participantIds: [ownerId, memberId],
      items: [{ name: 'Settle me', unitPriceCents: 4000, quantity: 1 }], taxCents: 0, tipCents: 0, otherCents: 0 } }).expect(201);
    const before = (await member.get('/api/budgets/personal').expect(200)).body.categories.find((category: Category) => category.key === 'other').spentCents;
    const payment = await prisma.expensePayment.create({ data: { expenseId: created.body.expense.id, senderUserId: memberId, amountCents: 2000, method: 'Venmo', clientRequestId: `budget-${run}` } });

    const sent = (await member.get('/api/budgets/personal').expect(200)).body;
    expect(byKey(sent.categories).other.spentCents).toBe(before);
    expect(sent.transactions.other).toContainEqual(expect.objectContaining({ id: `share-${created.body.expense.id}`, amountCents: 2000 }));
    // The recipient did not send anything, so their budget is unchanged.
    expect((await owner.get('/api/budgets/personal').expect(200)).body.transactions.other.some((item: { id: string }) => item.id.startsWith('payment-'))).toBe(false);

    const ownerBefore = byKey((await owner.get('/api/budgets/personal').expect(200)).body.categories).other.spentCents;
    await prisma.expensePayment.update({ where: { id: payment.id }, data: { status: 'CONFIRMED', resolvedAt: new Date() } });
    const repaid = (await owner.get('/api/budgets/personal').expect(200)).body;
    expect(repaid.transactions.other.some((row: { id: string }) => row.id.startsWith('repayment-'))).toBe(false);
    expect(byKey(repaid.categories).other.spentCents).toBe(ownerBefore);
    expect((await member.get('/api/budgets/personal').expect(200)).body.transactions.other).toContainEqual(expect.objectContaining({ id: `share-${created.body.expense.id}`, pending: false }));

    const thisMonth = (home: { history: { month: string; spendingCents: number }[] }) => home.history.at(-1)!.spendingCents;
    const homeSender = thisMonth((await member.get('/api/budgets/home').expect(200)).body);
    const homeRecipient = thisMonth((await owner.get('/api/budgets/home').expect(200)).body);
    await prisma.expensePayment.update({ where: { id: payment.id }, data: { status: 'ISSUE' } });
    expect(thisMonth((await member.get('/api/budgets/home').expect(200)).body)).toBe(homeSender);
    expect(thisMonth((await owner.get('/api/budgets/home').expect(200)).body)).toBe(homeRecipient);
    expect(byKey((await member.get('/api/budgets/personal').expect(200)).body.categories).other.spentCents).toBe(before);
  });
});

it('links only the payer’s bank charge even when the receipt amount differs and counts both participants shares without duplicates', async () => {
  const created = await owner.post(`/api/groups/${groupId}/expenses`).send({ clientRequestId: randomUUID(), expense: {
    title: 'Cheesecake', budgetCategory: 'dining', expenseDate: todayIso, paidByUserId: ownerId, splitMode: 'EQUAL', participantIds: [ownerId, memberId],
    items: [{ name: 'Dinner', unitPriceCents: 24000, quantity: 1 }], taxCents: 0, tipCents: 0, otherCents: 0 } }).expect(201);
  const id = created.body.expense.id;
  const account = await prisma.bankAccount.findFirstOrThrow({ where: { connection: { userId: ownerId }, hidden: false } });
  await owner.put(`/api/expenses/${id}/budget-link`).send({ category: 'dining', transactionId: null }).expect(204);
  const before = byKey((await owner.get('/api/budgets/personal')).body.categories).dining.spentCents;
  expect((await member.get('/api/budgets/personal')).body.transactions.other).toContainEqual(expect.objectContaining({ id: `share-${id}`, amountCents: 12000 }));
  const bank = await prisma.bankTransaction.create({ data: { accountId: account.id, plaidTransactionId: `cheesecake-${run}`, amountCents: 25000, date: new Date(todayIso), name: 'Cheesecake', category: 'FOOD_AND_DRINK' } });
  expect(byKey((await owner.get('/api/budgets/personal')).body.categories).dining.spentCents).toBe(before + 25000);
  expect((await owner.get(`/api/expenses/${id}/budget-link`)).body.candidates.map((t: { id: string }) => t.id)).toContain(bank.id);
  const body = { category: 'shopping', transactionId: bank.id };
  await member.put(`/api/expenses/${id}/budget-link`).send(body).expect(403);
  expect((await member.get(`/api/expenses/${id}/budget-link`)).body.candidates).toEqual([]);
  await owner.put(`/api/expenses/${id}/budget-link`).send(body).expect(204);
  expect((await owner.get(`/api/expenses/${id}/budget-link`)).body.category).toBe('dining');
  expect((await prisma.budgetNotice.findFirstOrThrow({ where: { expenseId: id, recipientId: ownerId } })).readAt).not.toBeNull();
  const linkedRows = (await owner.get('/api/budgets/personal')).body.transactions.dining;
  expect(linkedRows.some((row: { id: string }) => row.id === bank.id)).toBe(false);
  expect(linkedRows).toContainEqual(expect.objectContaining({ id: `share-${id}`, amountCents: 12000, linkedBank: expect.objectContaining({ amountCents: 25000 }) }));
  expect(byKey((await owner.get('/api/budgets/personal')).body.categories).dining.spentCents).toBe(before);
  await owner.put(`/api/expenses/${id}/budget-link`).send(body).expect(204);
  expect((await owner.get(`/api/expenses/${id}/budget-link`)).body.category).toBe('dining');
  expect(byKey((await owner.get('/api/budgets/personal')).body.categories).dining.spentCents).toBe(before);
  await owner.put(`/api/expenses/${id}/budget-link`).send({ category: 'dining', transactionId: null }).expect(204);
  expect(byKey((await owner.get('/api/budgets/personal')).body.categories).dining.spentCents).toBe(before + 25000);
});

it('keeps each participant category independent, defaulting to Other', async () => {
  for (const category of ['groceries', undefined]) {
    const result = await member.post(`/api/groups/${groupId}/expenses`).send({ clientRequestId: randomUUID(), expense: {
      title: 'Shared groceries', expenseDate: todayIso, paidByUserId: ownerId, splitMode: 'EQUAL', participantIds: [ownerId, memberId],
      budgetCategory: category, items: [{ name: 'Food', unitPriceCents: 2000, quantity: 1 }],
    } }).expect(201);
    expect(result.body.expense.budgetCategory).toBe(category ?? 'other');
    for (const agent of [owner, member]) {
      const budget = await agent.get('/api/budgets/personal').expect(200);
      expect(budget.body.transactions[agent === member ? category ?? 'other' : 'other']).toContainEqual(expect.objectContaining({ id: `share-${result.body.expense.id}`, amountCents: 1000 }));
    }
    await owner.put(`/api/expenses/${result.body.expense.id}/budget-category`).send({ category: 'transit' }).expect(204);
    expect((await member.get(`/api/expenses/${result.body.expense.id}/budget-link`)).body.category).toBe(category ?? 'other');
    expect((await owner.get('/api/budgets/personal')).body.transactions.transit).toContainEqual(expect.objectContaining({ id: `share-${result.body.expense.id}`, amountCents: 1000 }));
    await outsider.put(`/api/expenses/${result.body.expense.id}/budget-category`).send({ category: 'shopping' }).expect(404);

  }
});

it('notifies the assigned payer once and keeps the budget notice private', async () => {
  const input = { clientRequestId: randomUUID(), expense: { title: 'Payer notification', expenseDate: todayIso, paidByUserId: ownerId, splitMode: 'EQUAL', participantIds: [ownerId, memberId], items: [{ name: 'Meal', unitPriceCents: 1000, quantity: 1 }] } };
  const created = await member.post(`/api/groups/${groupId}/expenses`).send(input).expect(201);
  await member.post(`/api/groups/${groupId}/expenses`).send(input).expect(201);
  const notices = (await owner.get('/api/settlement-notices').expect(200)).body.notices.filter((n: { expenseId?: string }) => n.expenseId === created.body.expense.id);
  expect(notices).toHaveLength(1);
  expect(notices[0]).toMatchObject({ kind: 'BUDGET_LINK', groupId, readAt: null });
  await member.post(`/api/settlement-notices/${notices[0].id}/read`).expect(404);
  await owner.put(`/api/expenses/${created.body.expense.id}/budget-link`).send({ transactionId: null }).expect(204);
  expect((await prisma.budgetNotice.findUniqueOrThrow({ where: { id: notices[0].id } })).readAt).not.toBeNull();
  await member.post(`/api/settlement-notices/${notices[0].id}/unread`).expect(404);
  await owner.post(`/api/settlement-notices/${notices[0].id}/unread`).expect(204);
  expect((await owner.get('/api/settlement-notices')).body.notices.find((n: { id: string }) => n.id === notices[0].id).readAt).toBeNull();
  await owner.post(`/api/settlement-notices/${notices[0].id}/read`).expect(204);
  await member.delete(`/api/settlement-notices/${notices[0].id}`).expect(404);
  await member.delete('/api/settlement-notices').expect(204);
  expect((await owner.get('/api/settlement-notices')).body.notices.some((n: { id: string }) => n.id === notices[0].id)).toBe(true);
  await owner.delete(`/api/settlement-notices/${notices[0].id}`).expect(204);
  expect((await owner.get('/api/settlement-notices')).body.notices.some((n: { id: string }) => n.id === notices[0].id)).toBe(false);
  await owner.delete('/api/settlement-notices').expect(204);
  expect((await owner.get('/api/settlement-notices')).body.notices).toEqual([]);
});
