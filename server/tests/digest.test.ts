import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { buildWeeklyDigest, isDigestEmpty } from '../src/modules/digest/digest.service.js';

const owner = request.agent(app), member = request.agent(app), bank = request.agent(app), quiet = request.agent(app);
const agents = [owner, member, bank, quiet];
const userIds: string[] = [];
const groupIds: string[] = [];
const run = randomUUID().replaceAll('-', '').slice(0, 16);
let ownerId: string, memberId: string, bankId: string, quietId: string;

beforeAll(async () => {
  for (const [index, agent] of agents.entries()) {
    const result = await agent.post('/api/auth/register').send({ name: `Digest ${['Owner', 'Member', 'Bank', 'Quiet'][index]} Tester`, username: `dig_${run}_${index}`, email: `dig_${run}_${index}@example.com`, phone: `+1210${String(Date.now() + index).slice(-7)}`, password: 'password1' }).expect(201);
    userIds.push(result.body.user.id);
  }
  [ownerId, memberId, bankId, quietId] = userIds as [string, string, string, string];
  await owner.post(`/api/friends/${memberId}`).expect(201);
});

afterAll(async () => {
  await prisma.expensePayment.deleteMany({ where: { share: { expense: { groupId: { in: groupIds } } } } });
  await prisma.expense.deleteMany({ where: { groupId: { in: groupIds } } });
  await prisma.recurringBill.deleteMany({ where: { groupId: { in: groupIds } } });
  await prisma.group.deleteMany({ where: { id: { in: groupIds } } });
  // Bank connections, accounts, transactions and limits are deleted with their user.
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe('weekly digest from bank data', () => {
  // A fixed moment far in the future keeps the data clear of every other test. The seven days before it
  // (29 Dec 2089 to 4 Jan 2090) cross a month boundary, which exercises reading the previous month.
  const now = new Date('2090-01-05T14:00:00Z');

  beforeAll(async () => {
    const connection = await prisma.bankConnection.create({ data: { userId: bankId, plaidItemId: `digest-${run}`, institutionName: 'Test Bank', accessTokenEnc: 'not-a-real-token', status: 'NEEDS_ATTENTION', statusDetail: 'Consent expired' } });
    const shown = await prisma.bankAccount.create({ data: { connectionId: connection.id, plaidAccountId: `digest-shown-${run}`, name: 'Checking' } });
    const hidden = await prisma.bankAccount.create({ data: { connectionId: connection.id, plaidAccountId: `digest-hidden-${run}`, name: 'Savings', hidden: true } });
    const row = (account: { id: string }, id: string, amountCents: number, date: string, category: string, extra: { merchant?: string; reviewedAt?: Date; excluded?: boolean } = {}) =>
      ({ accountId: account.id, plaidTransactionId: `${id}-${run}`, amountCents, date: new Date(`${date}T00:00:00Z`), name: 'Charge', merchant: extra.merchant ?? null, category, ...extra });
    await prisma.bankTransaction.createMany({ data: [
      row(shown, 'dining-dec30', 7410, '2089-12-30', 'FOOD_AND_DRINK', { merchant: 'Thai Basil' }),
      row(shown, 'dining-dec20', 10000, '2089-12-20', 'FOOD_AND_DRINK', { merchant: 'Thai Basil' }),
      row(shown, 'dining-jan1', 40000, '2090-01-01', 'FOOD_AND_DRINK', { merchant: 'Fancy Dinner' }),
      row(shown, 'grocery-jan2', 5200, '2090-01-02', 'FOOD_AND_DRINK', { merchant: "Trader Joe's" }),
      row(shown, 'transit-jan3', 2130, '2090-01-03', 'TRANSPORTATION', { merchant: 'Metro' }),
      row(shown, 'shopping-jan4', 2600, '2090-01-04', 'GENERAL_MERCHANDISE', { merchant: 'Bookshop', reviewedAt: new Date() }),
      row(shown, 'dining-jan5', 1000, '2090-01-05', 'FOOD_AND_DRINK', { merchant: 'Coffee' }),
      row(shown, 'excluded-jan2', 8888, '2090-01-02', 'FOOD_AND_DRINK', { merchant: 'Excluded', excluded: true }),
      row(hidden, 'hidden-jan2', 9999, '2090-01-02', 'FOOD_AND_DRINK', { merchant: 'Hidden account' }),
    ] });
    await prisma.categoryLimit.createMany({ data: [{ userId: bankId, category: 'dining', limitCents: 36500 }, { userId: bankId, category: 'shopping', limitCents: 3000 }] });
  });

  it('adds up the seven days across both months, skipping hidden accounts, excluded charges and other days', async () => {
    const digest = await buildWeeklyDigest(bankId, now);
    expect(digest.firstName).toBe('Digest');
    expect(digest.period).toEqual({ start: '2089-12-29', end: '2090-01-04' });
    expect(digest.spending?.weekCents).toBe(57340);
    expect(digest.spending?.topCategories).toEqual([
      { key: 'dining', label: 'Dining', cents: 47410 }, { key: 'groceries', label: 'Groceries', cents: 5200 }, { key: 'shopping', label: 'Shopping', cents: 2600 },
    ]);
  });

  it('reports the month against the limits that are set', async () => {
    const digest = await buildWeeklyDigest(bankId, now);
    expect(digest.spending?.month).toEqual({ label: 'January', plannedCents: 39500, spentCents: 50930, daysLeft: 26 });
  });

  it('lists attention items first, then over-limit and near-limit categories', async () => {
    const digest = await buildWeeklyDigest(bankId, now);
    expect(digest.alerts).toEqual([
      { tone: 'attention', title: 'Bank connection needs re-authentication', detail: '6 transactions pending review' },
      { tone: 'over', title: 'Dining is over limit', detail: '$410 of $365 budget used' },
      { tone: 'near', title: 'Shopping near limit', detail: '87% of budget ($26 of $30)' },
    ]);
    expect(isDigestEmpty(digest)).toBe(false);
  });

  it('has nothing to send for a user with no activity', async () => {
    const digest = await buildWeeklyDigest(quietId, now);
    expect(digest).toMatchObject({ alerts: [], spending: null, splitting: null, settling: null, comingUp: [] });
    expect(isDigestEmpty(digest)).toBe(true);
  });
});

describe('local preview routes', () => {
  it('serves the sample email as HTML, plain text and JSON without signing in', async () => {
    const html = await request(app).get('/api/digest/sample').expect(200).expect('Content-Type', /html/);
    expect(html.text).toContain('Hi Sidhya,');
    expect((await request(app).get('/api/digest/sample?format=text').expect(200).expect('Content-Type', /text\/plain/)).text).toContain('Spent this week: $182.40');
    const json = (await request(app).get('/api/digest/sample?format=json').expect(200)).body;
    expect(json).toMatchObject({ subject: 'Your week in Divvy: $182.40 spent', empty: false });
    await request(app).get('/api/digest/sample?format=pdf').expect(400);
  });

  it('requires a session for a real preview, and explains an empty week', async () => {
    await request(app).get('/api/digest/preview').expect(401);
    expect((await quiet.get('/api/digest/preview').expect(200)).text).toContain('Nothing to report this week');
    expect((await quiet.get('/api/digest/preview?format=json').expect(200)).body).toMatchObject({ empty: true });
    await quiet.get('/api/digest/preview?now=yesterday').expect(400);
  });
});

describe('weekly digest from group activity', () => {
  // Real time, with dates relative to it, so the test holds on any day.
  const now = new Date();
  const dayOffset = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  let expenseId: string;

  beforeAll(async () => {
    const general = (await owner.post('/api/groups').send({ name: 'Digest dinners', type: 'General', memberIds: [memberId] }).expect(201)).body.group.id as string;
    const recurring = (await owner.post('/api/groups').send({ name: 'Digest rent', type: 'Recurring', memberIds: [memberId] }).expect(201)).body.group.id as string;
    groupIds.push(general, recurring);
    expenseId = (await owner.post(`/api/groups/${general}/expenses`).send({ clientRequestId: randomUUID(), expense: {
      title: 'Dinner', expenseDate: dayOffset(-1), paidByUserId: ownerId, splitMode: 'EQUAL', participantIds: [ownerId, memberId],
      items: [{ name: 'Dinner', quantity: 1, unitPriceCents: 2000, assignedUserIds: [] }], taxCents: 0, tipCents: 0, otherCents: 0,
    } }).expect(201)).body.expense.id;
    await owner.post(`/api/groups/${recurring}/recurring`).send({ title: 'Rent', amountCents: 2000, startDate: dayOffset(3), frequency: 'Monthly', defaultPlan: { payerId: ownerId, shares: { [ownerId]: 1000, [memberId]: 1000 } } }).expect(201);
    await member.post(`/api/expenses/${expenseId}/payments`).send({ amountCents: 400, clientRequestId: randomUUID() }).expect(201);
  });

  it('summarizes splitting, balances, payments to confirm and the bill coming up for the payer', async () => {
    const digest = await buildWeeklyDigest(ownerId, now);
    expect(digest.splitting).toEqual({ count: 1, totalCents: 2000, paidCents: 2000, shareCents: 1000 });
    expect(digest.settling).toEqual({ owedCents: 1000, owedGroups: 1, oweCents: 0, oweGroups: 0, awaitingConfirmation: 1 });
    expect(digest.comingUp).toEqual([{ title: 'Rent', date: dayOffset(3), shareCents: 1000 }]);
  });

  it('shows the other member what they owe, without the payer\'s confirmation task', async () => {
    const digest = await buildWeeklyDigest(memberId, now);
    expect(digest.splitting).toEqual({ count: 1, totalCents: 2000, paidCents: 0, shareCents: 1000 });
    expect(digest.settling).toEqual({ owedCents: 0, owedGroups: 0, oweCents: 1000, oweGroups: 1, awaitingConfirmation: 0 });
    expect(digest.comingUp).toEqual([{ title: 'Rent', date: dayOffset(3), shareCents: 1000 }]);
  });

  it('adds the member\'s share of the expense to their weekly spending', async () => {
    const digest = await buildWeeklyDigest(memberId, now);
    expect(digest.spending?.weekCents).toBe(1000);
  });

  it('leaves a bill that is more than seven days away out of the email', async () => {
    const digest = await buildWeeklyDigest(ownerId, new Date(now.getTime() - 5 * 86_400_000));
    expect(digest.comingUp).toEqual([]);
  });
});
