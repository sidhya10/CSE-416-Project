import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const plaidMock = vi.hoisted(() => ({
  linkTokenCreate: vi.fn(), itemPublicTokenExchange: vi.fn(), accountsGet: vi.fn(), itemGet: vi.fn(),
  institutionsGetById: vi.fn(), transactionsSync: vi.fn(), itemRemove: vi.fn(),
}));
vi.mock('../src/modules/banking/plaid.client.js', async importOriginal => ({
  ...await importOriginal<typeof import('../src/modules/banking/plaid.client.js')>(),
  plaid: () => plaidMock,
}));

import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { decryptToken, encryptToken } from '../src/modules/banking/bank.crypto.js';

const owner = request.agent(app), other = request.agent(app);
const userIds: string[] = [];
const run = randomUUID().slice(0, 8);
const accountsPayload = { accounts: [
  { account_id: `chk-${run}`, name: 'Checking', mask: '1842', type: 'depository', balances: { current: 1842.6 } },
  { account_id: `card-${run}`, name: 'Card', mask: '7741', type: 'credit', balances: { current: 328.44 } },
] };
const tx = (id: string, amount: number, extra = {}) => ({ transaction_id: `${id}-${run}`, account_id: `chk-${run}`, amount, date: '2026-10-01', name: 'Coffee', merchant_name: 'Cafe', pending: false, personal_finance_category: { primary: 'FOOD_AND_DRINK' }, ...extra });

beforeAll(async () => {
  for (const [index, agent] of [owner, other].entries()) {
    const response = await agent.post('/api/auth/register').send({ name: `Bank ${index}`, email: `bank-${index}-${run}@example.com`, username: `bank_${index}_${run}`, phone: `+1210${String(Date.now() + index).slice(-7)}`, password: 'password1' });
    expect(response.status).toBe(201); userIds.push(response.body.user.id);
  }
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});
beforeEach(() => {
  Object.values(plaidMock).forEach(mock => mock.mockReset());
  plaidMock.linkTokenCreate.mockResolvedValue({ data: { link_token: 'link-sandbox-token' } });
  plaidMock.itemPublicTokenExchange.mockResolvedValue({ data: { access_token: 'access-secret-token', item_id: `item-${randomUUID()}` } });
  plaidMock.accountsGet.mockResolvedValue({ data: accountsPayload });
  plaidMock.itemGet.mockResolvedValue({ data: { item: { institution_id: 'ins_1' } } });
  plaidMock.institutionsGetById.mockResolvedValue({ data: { institution: { name: 'Test Bank' } } });
  plaidMock.transactionsSync.mockResolvedValue({ data: { added: [tx('a', 4.5)], modified: [], removed: [], next_cursor: 'c1', has_more: false } });
  plaidMock.itemRemove.mockResolvedValue({ data: {} });
});

describe('token encryption', () => {
  it('round-trips and does not store plaintext', () => {
    const stored = encryptToken('access-secret-token');
    expect(stored).not.toContain('access-secret-token');
    expect(decryptToken(stored)).toBe('access-secret-token');
    const [iv, tag, body] = stored.split('.').map(part => Buffer.from(part, 'base64'));
    body![0] = body![0]! ^ 1;
    expect(() => decryptToken([iv, tag, body].map(part => part!.toString('base64')).join('.'))).toThrow();
  });
});

describe('bank connections', () => {
  it('requires authentication', async () => {
    await request(app).get('/api/banking/accounts').expect(401);
    await request(app).post('/api/banking/link-token').expect(401);
  });

  it('creates a link token, exchanges it, encrypts the token and imports balances and transactions', async () => {
    const link = await owner.post('/api/banking/link-token').send({}).expect(200);
    expect(link.body.linkToken).toBe('link-sandbox-token');
    expect(plaidMock.linkTokenCreate.mock.calls[0]![0].products).toEqual(['transactions']);

    const exchanged = await owner.post('/api/banking/exchange').send({ publicToken: 'public-sandbox-x' }).expect(201);
    expect(exchanged.body.accounts).toHaveLength(2);
    const checking = exchanged.body.accounts.find((a: { last4: string }) => a.last4 === '1842');
    const card = exchanged.body.accounts.find((a: { last4: string }) => a.last4 === '7741');
    expect(checking).toMatchObject({ institution: 'Test Bank', balanceCents: 184260, status: 'synced' });
    expect(card.balanceCents).toBe(-32844);
    expect(JSON.stringify(exchanged.body)).not.toContain('access-secret-token');

    const stored = await prisma.bankConnection.findFirstOrThrow({ where: { userId: userIds[0] } });
    expect(stored.accessTokenEnc).not.toContain('access-secret-token');
    expect(decryptToken(stored.accessTokenEnc)).toBe('access-secret-token');
    expect(stored.syncCursor).toBe('c1');
    const rows = await prisma.bankTransaction.findMany({ where: { account: { connectionId: stored.id } } });
    expect(rows).toMatchObject([{ amountCents: 450, merchant: 'Cafe', category: 'FOOD_AND_DRINK' }]);

    await other.get('/api/banking/accounts').expect(200).expect(response => expect(response.body.accounts).toEqual([]));
    await other.patch(`/api/banking/accounts/${checking.id}`).send({ hidden: true }).expect(404);
    await other.delete(`/api/banking/connections/${stored.id}`).expect(404);
    await other.post('/api/banking/link-token').send({ connectionId: stored.id }).expect(404);
  });

  it('syncs incrementally with modified and removed transactions, and renames and hides accounts', async () => {
    const connection = await prisma.bankConnection.findFirstOrThrow({ where: { userId: userIds[0] }, include: { accounts: true } });
    plaidMock.transactionsSync
      .mockResolvedValueOnce({ data: { added: [tx('b', 10)], modified: [tx('a', 6)], removed: [], next_cursor: 'c2', has_more: true } })
      .mockResolvedValueOnce({ data: { added: [], modified: [], removed: [{ transaction_id: `b-${run}` }], next_cursor: 'c3', has_more: false } });
    const synced = await owner.post('/api/banking/sync').expect(200);
    expect(synced.body.added).toBe(1);
    expect(plaidMock.transactionsSync.mock.calls[0]![0].cursor).toBe('c1');
    expect(plaidMock.transactionsSync.mock.calls[1]![0].cursor).toBe('c2');
    const rows = await prisma.bankTransaction.findMany({ where: { account: { connectionId: connection.id } } });
    expect(rows.map(row => row.amountCents)).toEqual([600]);
    expect((await prisma.bankConnection.findUniqueOrThrow({ where: { id: connection.id } })).syncCursor).toBe('c3');

    const id = connection.accounts[0]!.id;
    const patched = await owner.patch(`/api/banking/accounts/${id}`).send({ nickname: 'Rent money', hidden: true }).expect(200);
    expect(patched.body.accounts.find((a: { id: string }) => a.id === id)).toMatchObject({ nickname: 'Rent money', hidden: true });
    await owner.patch(`/api/banking/accounts/${id}`).send({ nickname: '' }).expect(400);
  });

  it('lists private transactions and saves categories, exclusions, notes, and exact category splits', async () => {
    const transaction = await prisma.bankTransaction.findFirstOrThrow({ where: { account: { connection: { userId: userIds[0] } } } });
    const listed = await owner.get('/api/banking/transactions').expect(200);
    expect(listed.body.transactions).toContainEqual(expect.objectContaining({ id: transaction.id, reviewed: true, needsReview: false, category: 'dining', excluded: false }));
    await other.get('/api/banking/transactions').expect(200).expect(response => expect(response.body.transactions).toEqual([]));
    await other.put(`/api/banking/transactions/${transaction.id}/review`).send({ category: 'shopping', excluded: false, reviewed: true, note: null, splits: [] }).expect(404);

    await owner.put(`/api/banking/transactions/${transaction.id}/review`).send({
      category: null, excluded: false, reviewed: true, note: 'Team lunch and supplies',
      splits: [{ category: 'dining', amountCents: 200 }, { category: 'shopping', amountCents: 300 }],
    }).expect(400);
    const reviewed = await owner.put(`/api/banking/transactions/${transaction.id}/review`).send({
      category: null, excluded: false, reviewed: true, note: 'Team lunch and supplies',
      splits: [{ category: 'dining', amountCents: 200 }, { category: 'shopping', amountCents: transaction.amountCents - 200 }],
    }).expect(200);
    expect(reviewed.body.transaction).toMatchObject({ reviewed: true, note: 'Team lunch and supplies', splits: [
      { category: 'dining', amountCents: 200 }, { category: 'shopping', amountCents: transaction.amountCents - 200 },
    ] });
    expect((await owner.get('/api/banking/transactions').query({ status: 'reviewed', query: 'team lunch' }).expect(200)).body.transactions).toHaveLength(1);

    const excluded = await owner.put(`/api/banking/transactions/${transaction.id}/review`).send({ category: 'other', excluded: true, reviewed: true, note: null, splits: [] }).expect(200);
    expect(excluded.body.transaction).toMatchObject({ excluded: true, category: 'other', splits: [] });
    expect((await owner.get('/api/banking/transactions').query({ status: 'excluded' }).expect(200)).body.transactions[0].id).toBe(transaction.id);
  });

  it('ranks private posted bank charges for an expense without linking automatically', async () => {
    const account = await prisma.bankAccount.findFirstOrThrow({ where: { connection: { userId: userIds[0] }, hidden: false } });
    const exact = await prisma.bankTransaction.create({ data: {
      accountId: account.id, plaidTransactionId: `match-exact-${run}`, amountCents: 2301,
      date: new Date('2026-10-10T00:00:00.000Z'), name: 'Myers Chang Boston', merchant: 'Myers + Chang', pending: false,
    } });
    await prisma.bankTransaction.create({ data: {
      accountId: account.id, plaidTransactionId: `match-near-${run}`, amountCents: 2350,
      date: new Date('2026-10-12T00:00:00.000Z'), name: 'Restaurant', merchant: 'Other Cafe', pending: false,
    } });
    const older = await prisma.bankTransaction.create({ data: {
      accountId: account.id, plaidTransactionId: `match-old-${run}`, amountCents: 2301,
      date: new Date('2025-01-01T00:00:00.000Z'), name: 'Historic Bakery', merchant: 'Old Bakery', pending: false,
    } });
    const amountOnly = await owner.get('/api/banking/expense-matches').query({ amountCents: 2301 }).expect(200);
    expect(amountOnly.body.suggestions.map((row: { id: string }) => row.id)).toContain(older.id);
    expect(amountOnly.body.suggestions.find((row: { id: string }) => row.id === older.id).reasons).toEqual(['Exact amount']);
    const searched = await owner.get('/api/banking/expense-matches').query({ amountCents: 2301, query: 'historic' }).expect(200);
    expect(searched.body.suggestions.map((row: { id: string }) => row.id)).toEqual([older.id]);
    await owner.get('/api/banking/expense-matches').query({ amountCents: 2301, date: '2026-10-10', query: 'bakery' }).expect(200)
      .expect(response => expect(response.body.suggestions).toEqual([]));
    const suggested = await owner.get('/api/banking/expense-matches').query({ amountCents: 2301, date: '2026-10-10', merchant: 'Dinner at Myers Chang' }).expect(200);
    expect(suggested.body.suggestions[0]).toMatchObject({ id: exact.id, amountCents: 2301 });
    expect(suggested.body.suggestions[0].reasons).toEqual(expect.arrayContaining(['Exact amount', 'Same date', 'Similar merchant']));
    await other.get('/api/banking/expense-matches').query({ amountCents: 2301, date: '2026-10-10', merchant: 'Myers' }).expect(200)
      .expect(response => expect(response.body.suggestions).toEqual([]));
    await request(app).get('/api/banking/expense-matches').query({ amountCents: 2301, date: '2026-10-10' }).expect(401);
  });

  it('runs an incremental bank sync after password login without letting Plaid failure block access', async () => {
    await owner.post('/api/auth/logout').expect(204);
    plaidMock.transactionsSync.mockResolvedValue({ data: { added: [tx('login-sync', 12)], modified: [], removed: [], next_cursor: 'login-cursor', has_more: false } });
    await owner.post('/api/auth/login').send({ identifier: `bank_0_${run}`, password: 'password1' }).expect(200);
    expect(await prisma.bankTransaction.count({ where: { plaidTransactionId: `login-sync-${run}` } })).toBe(1);

    await owner.post('/api/auth/logout').expect(204);
    plaidMock.transactionsSync.mockRejectedValueOnce(new Error('temporary Plaid outage'));
    await owner.post('/api/auth/login').send({ identifier: `bank_0_${run}`, password: 'password1' }).expect(200);
  });

  it('only asks for uncategorized spending and hides credit-card payoff transactions', async () => {
    plaidMock.transactionsSync.mockResolvedValue({ data: { added: [
      tx('uncategorized', 19, { name: 'Mystery purchase', merchant_name: null, personal_finance_category: null }),
      tx('card-payment', 250, { name: 'AUTOPAY PAYMENT - THANK YOU', merchant_name: null, personal_finance_category: { primary: 'LOAN_PAYMENTS' } }),
    ], modified: [], removed: [], next_cursor: 'category-cursor', has_more: false } });
    await owner.post('/api/banking/sync').expect(200);
    const needsCategory = await owner.get('/api/banking/transactions').query({ status: 'unreviewed' }).expect(200);
    expect(needsCategory.body.transactions).toContainEqual(expect.objectContaining({ merchant: 'Mystery purchase', needsReview: true, reviewed: false }));
    const all = await owner.get('/api/banking/transactions').query({ status: 'all' }).expect(200);
    expect(all.body.transactions.some((item: { name: string }) => item.name.includes('AUTOPAY'))).toBe(false);
    const hidden = await prisma.bankTransaction.findUniqueOrThrow({ where: { plaidTransactionId: `card-payment-${run}` } });
    expect(hidden).toMatchObject({ excluded: true, autoExcludedReason: 'CREDIT_CARD_PAYMENT', needsReview: false });
  });

  it('flags a connection that needs re-authentication and restores it afterwards', async () => {
    const connection = await prisma.bankConnection.findFirstOrThrow({ where: { userId: userIds[0] } });
    plaidMock.transactionsSync.mockRejectedValueOnce({ response: { data: { error_code: 'ITEM_LOGIN_REQUIRED' } } });
    await owner.post('/api/banking/sync').expect(200);
    const flagged = await owner.get('/api/banking/accounts').expect(200);
    expect(flagged.body.accounts[0]).toMatchObject({ status: 'needs-attention', statusDetail: 'Consent expired' });

    const link = await owner.post('/api/banking/link-token').send({ connectionId: connection.id }).expect(200);
    expect(link.body.linkToken).toBe('link-sandbox-token');
    expect(plaidMock.linkTokenCreate.mock.calls[0]![0]).toMatchObject({ access_token: 'access-secret-token' });
    expect(plaidMock.linkTokenCreate.mock.calls[0]![0].products).toBeUndefined();
    const fixed = await owner.post(`/api/banking/connections/${connection.id}/reauthenticated`).expect(200);
    expect(fixed.body.accounts[0].status).toBe('synced');
  });

  it('revokes at Plaid and deletes accounts and transactions on disconnect, keeping the record if Plaid fails', async () => {
    const connection = await prisma.bankConnection.findFirstOrThrow({ where: { userId: userIds[0] } });
    plaidMock.itemRemove.mockRejectedValueOnce(new Error('plaid down'));
    await owner.delete(`/api/banking/connections/${connection.id}`).expect(500);
    expect(await prisma.bankConnection.count({ where: { id: connection.id } })).toBe(1);
    await owner.delete(`/api/banking/connections/${connection.id}`).expect(204);
    expect(plaidMock.itemRemove).toHaveBeenLastCalledWith({ access_token: 'access-secret-token' });
    expect(await prisma.bankAccount.count({ where: { connectionId: connection.id } })).toBe(0);
    expect(await prisma.bankTransaction.count({ where: { account: { connectionId: connection.id } } })).toBe(0);
  });

  it('validates the exchange body', async () => {
    await owner.post('/api/banking/exchange').send({}).expect(400);
  });
});
