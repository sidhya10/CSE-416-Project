import { CountryCode, Products, type AccountBase, type RemovedTransaction, type Transaction } from 'plaid';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { decryptToken, encryptToken } from './bank.crypto.js';
import { BankingError, plaid, plaidErrorCode } from './plaid.client.js';
import { CATEGORY_KEYS, categorize, type CategoryKey } from '../budgets/budget.categories.js';

const REAUTH_CODES = new Set(['ITEM_LOGIN_REQUIRED', 'PENDING_EXPIRATION', 'PENDING_DISCONNECT']);
const cents = (amount: number | null | undefined) => Math.round((amount ?? 0) * 100);
// Plaid reports credit/loan balances as amounts owed; the UI shows them as negative.
const signedBalance = (account: AccountBase) => {
  const value = cents(account.balances.current);
  return account.type === 'credit' || account.type === 'loan' ? -value : value;
};

export async function createLinkToken(userId: string, connectionId?: string) {
  const base = { user: { client_user_id: userId }, client_name: 'Receipt Split', country_codes: [CountryCode.Us], language: 'en' };
  if (connectionId) {
    const connection = await prisma.bankConnection.findFirst({ where: { id: connectionId, userId } });
    if (!connection) throw new BankingError('Connection not found', 404);
    const { data } = await plaid().linkTokenCreate({ ...base, access_token: decryptToken(connection.accessTokenEnc) });
    return data.link_token;
  }
  const { data } = await plaid().linkTokenCreate({ ...base, products: [Products.Transactions] });
  return data.link_token;
}

async function institutionNameFor(accessToken: string) {
  try {
    const { data: item } = await plaid().itemGet({ access_token: accessToken });
    if (!item.item.institution_id) return 'Bank';
    const { data } = await plaid().institutionsGetById({ institution_id: item.item.institution_id, country_codes: [CountryCode.Us] });
    return data.institution.name;
  } catch { return 'Bank'; }
}

export async function exchangePublicToken(userId: string, publicToken: string) {
  const { data } = await plaid().itemPublicTokenExchange({ public_token: publicToken });
  const [{ data: accounts }, institutionName] = await Promise.all([
    plaid().accountsGet({ access_token: data.access_token }),
    institutionNameFor(data.access_token),
  ]);
  const connection = await prisma.bankConnection.create({
    data: {
      userId, plaidItemId: data.item_id, institutionName, accessTokenEnc: encryptToken(data.access_token),
      accounts: { create: accounts.accounts.map(account => ({ plaidAccountId: account.account_id, name: account.name, mask: account.mask ?? '', balanceCents: signedBalance(account) })) },
    },
  });
  // A failed first pull must not lose the link; the user can retry with "Sync now".
  await syncConnection(connection.id).catch(() => undefined);
  return connection.id;
}

export async function listAccounts(userId: string) {
  const rows = await prisma.bankAccount.findMany({ where: { connection: { userId } }, include: { connection: true }, orderBy: [{ connection: { createdAt: 'asc' } }, { name: 'asc' }] });
  return rows.map(row => ({
    id: row.id, connectionId: row.connectionId, institution: row.connection.institutionName, nickname: row.nickname ?? row.name,
    last4: row.mask, balanceCents: row.balanceCents, hidden: row.hidden,
    status: row.connection.status === 'ACTIVE' ? 'synced' as const : 'needs-attention' as const,
    statusDetail: row.connection.statusDetail ?? undefined, syncedAt: row.connection.lastSyncedAt?.getTime() ?? null,
  }));
}

export async function updateAccount(userId: string, id: string, patch: { nickname?: string | null; hidden?: boolean }) {
  const { count } = await prisma.bankAccount.updateMany({ where: { id, connection: { userId } }, data: patch });
  if (!count) throw new BankingError('Account not found', 404);
}

export async function disconnect(userId: string, connectionId: string) {
  const connection = await prisma.bankConnection.findFirst({ where: { id: connectionId, userId } });
  if (!connection) throw new BankingError('Connection not found', 404);
  // Revoke at Plaid first so a failure keeps the local record and lets the user retry.
  try { await plaid().itemRemove({ access_token: decryptToken(connection.accessTokenEnc) }); }
  catch (error) { if (plaidErrorCode(error) !== 'ITEM_NOT_FOUND') throw error; }
  await prisma.bankConnection.delete({ where: { id: connection.id } });
}

export async function markReauthenticated(userId: string, connectionId: string) {
  const { count } = await prisma.bankConnection.updateMany({ where: { id: connectionId, userId }, data: { status: 'ACTIVE', statusDetail: null } });
  if (!count) throw new BankingError('Connection not found', 404);
  await syncConnection(connectionId).catch(() => undefined);
}

export async function syncAll(userId: string) {
  const connections = await prisma.bankConnection.findMany({ where: { userId, status: 'ACTIVE' }, select: { id: true } });
  let added = 0;
  for (const { id } of connections) added += await syncConnection(id).catch(() => 0);
  return added;
}

export type ExpenseMatchInput = { amountCents: number; date: string; merchant?: string };

const normalizedWords = (value: string) => new Set(value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(word => word.length > 1));
const merchantSimilarity = (query: string, candidate: string) => {
  const wanted = normalizedWords(query), available = normalizedWords(candidate);
  if (!wanted.size || !available.size) return 0;
  let shared = 0;
  for (const word of wanted) if (available.has(word)) shared++;
  return shared / Math.max(wanted.size, available.size);
};

// Suggestions never link automatically. They expose only the signed-in user's available,
// posted charges and rank amount first, then date proximity and merchant similarity.
export async function suggestExpenseMatches(userId: string, input: ExpenseMatchInput) {
  const expenseDate = new Date(`${input.date}T00:00:00.000Z`);
  const day = 86_400_000;
  const start = new Date(expenseDate.getTime() - 14 * day);
  const end = new Date(expenseDate.getTime() + 14 * day);
  const tolerance = Math.max(100, Math.min(1_000, Math.round(input.amountCents * 0.1)));
  const rows = await prisma.bankTransaction.findMany({
    where: {
      pending: false,
      amountCents: { gt: 0, gte: Math.max(1, input.amountCents - tolerance), lte: input.amountCents + tolerance },
      date: { gte: start, lte: end },
      linkedExpense: null,
      account: { hidden: false, connection: { userId } },
    },
    include: { account: { include: { connection: { select: { institutionName: true } } } } },
    take: 100,
  });
  return rows.map(row => {
    const amountDifferenceCents = Math.abs(row.amountCents - input.amountCents);
    const dateDifferenceDays = Math.round(Math.abs(row.date.getTime() - expenseDate.getTime()) / day);
    const similarity = input.merchant?.trim() ? merchantSimilarity(input.merchant, `${row.merchant ?? ''} ${row.name}`) : 0;
    const amountScore = amountDifferenceCents === 0 ? 70 : Math.max(0, 45 * (1 - amountDifferenceCents / tolerance));
    const score = amountScore + Math.max(0, 20 - dateDifferenceDays * 2) + similarity * 10;
    const reasons = [
      amountDifferenceCents === 0 ? 'Exact amount' : `Amount differs by $${(amountDifferenceCents / 100).toFixed(2)}`,
      dateDifferenceDays === 0 ? 'Same date' : `${dateDifferenceDays} day${dateDifferenceDays === 1 ? '' : 's'} apart`,
      ...(similarity >= 0.5 ? ['Similar merchant'] : []),
    ];
    return {
      id: row.id, merchant: row.merchant ?? row.name, name: row.name, amountCents: row.amountCents,
      date: row.date.toISOString().slice(0, 10), accountName: row.account.nickname ?? row.account.name,
      institution: row.account.connection.institutionName, score: Math.round(score), reasons,
    };
  }).sort((a, b) => b.score - a.score || a.date.localeCompare(b.date)).slice(0, 5);
}

export type TransactionReviewStatus = 'all' | 'unreviewed' | 'reviewed' | 'excluded';
export type TransactionReviewPatch = {
  category: CategoryKey | null;
  excluded: boolean;
  note: string | null;
  reviewed: boolean;
  splits: { category: CategoryKey; amountCents: number }[];
};

const presentedCategory = (row: { categoryOverride: string | null; category: string | null; name: string; merchant: string | null }) =>
  row.categoryOverride && CATEGORY_KEYS.includes(row.categoryOverride as CategoryKey)
    ? row.categoryOverride as CategoryKey
    : categorize(row);

const transactionReviewInclude = {
  account: { include: { connection: { select: { institutionName: true } } } },
  linkedExpense: { select: { id: true, title: true } },
  reviewSplits: { orderBy: { position: 'asc' as const } },
} satisfies Prisma.BankTransactionInclude;
type TransactionReviewRow = Prisma.BankTransactionGetPayload<{ include: typeof transactionReviewInclude }>;
const presentTransaction = (row: TransactionReviewRow) => ({
  id: row.id,
  accountId: row.accountId,
  accountName: row.account.nickname ?? row.account.name,
  institution: row.account.connection.institutionName,
  merchant: row.merchant ?? row.name,
  name: row.name,
  date: row.date.toISOString().slice(0, 10),
  amountCents: row.amountCents,
  pending: row.pending,
  providerCategory: row.category,
  category: presentedCategory(row),
  excluded: row.excluded,
  note: row.reviewNote,
  reviewed: !!row.reviewedAt,
  reviewedAt: row.reviewedAt?.getTime() ?? null,
  linkedExpense: row.linkedExpense,
  splits: row.reviewSplits.map(split => ({ id: split.id, category: split.category as CategoryKey, amountCents: split.amountCents })),
});

export async function listTransactions(userId: string, filters: { query?: string; status: TransactionReviewStatus }) {
  const query = filters.query?.trim();
  const rows = await prisma.bankTransaction.findMany({
    where: {
      account: { connection: { userId } },
      ...(filters.status === 'unreviewed' ? { reviewedAt: null, excluded: false }
        : filters.status === 'reviewed' ? { reviewedAt: { not: null }, excluded: false }
          : filters.status === 'excluded' ? { excluded: true } : {}),
      ...(query ? { OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { merchant: { contains: query, mode: 'insensitive' } },
        { reviewNote: { contains: query, mode: 'insensitive' } },
        { account: { name: { contains: query, mode: 'insensitive' } } },
        { account: { nickname: { contains: query, mode: 'insensitive' } } },
      ] } : {}),
    },
    include: transactionReviewInclude,
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
    take: 200,
  });
  return rows.map(presentTransaction);
}

export async function reviewTransaction(userId: string, id: string, patch: TransactionReviewPatch) {
  const row = await prisma.bankTransaction.findFirst({ where: { id, account: { connection: { userId } } } });
  if (!row) throw new BankingError('Transaction not found', 404);
  if (patch.splits.length) {
    if (row.amountCents <= 0) throw new BankingError('Only spending transactions can be split', 400);
    if (patch.splits.reduce((sum, split) => sum + split.amountCents, 0) !== row.amountCents) throw new BankingError('Split amounts must equal the transaction total', 400);
    if (new Set(patch.splits.map(split => split.category)).size !== patch.splits.length) throw new BankingError('Use each split category only once', 400);
  }
  await prisma.$transaction(async tx => {
    await tx.bankTransactionSplit.deleteMany({ where: { bankTransactionId: row.id } });
    await tx.bankTransaction.update({
      where: { id: row.id },
      data: {
        categoryOverride: patch.splits.length ? null : patch.category,
        excluded: patch.excluded,
        reviewNote: patch.note,
        reviewedAt: patch.reviewed ? new Date() : null,
        ...(patch.splits.length ? { reviewSplits: { create: patch.splits.map((split, position) => ({ ...split, position })) } } : {}),
      },
    });
  });
  const saved = await prisma.bankTransaction.findFirstOrThrow({ where: { id, account: { connection: { userId } } }, include: transactionReviewInclude });
  return presentTransaction(saved);
}

async function pull(accessToken: string, startCursor: string | null) {
  const added: Transaction[] = [], modified: Transaction[] = [], removed: RemovedTransaction[] = [];
  let cursor = startCursor ?? undefined, more = true;
  while (more) {
    const { data } = await plaid().transactionsSync({ access_token: accessToken, cursor, count: 500 });
    added.push(...data.added); modified.push(...data.modified); removed.push(...data.removed);
    cursor = data.next_cursor; more = data.has_more;
  }
  return { added, modified, removed, cursor };
}

export async function syncConnection(connectionId: string) {
  const connection = await prisma.bankConnection.findUniqueOrThrow({ where: { id: connectionId }, include: { accounts: true } });
  const accessToken = decryptToken(connection.accessTokenEnc);
  try {
    let result;
    try { result = await pull(accessToken, connection.syncCursor); }
    catch (error) {
      // Data changed mid-pagination: Plaid requires restarting from the last committed cursor.
      if (plaidErrorCode(error) !== 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION') throw error;
      result = await pull(accessToken, connection.syncCursor);
    }
    const { data: fresh } = await plaid().accountsGet({ access_token: accessToken });
    const accountIds = new Map(connection.accounts.map(account => [account.plaidAccountId, account.id]));
    const toRow = (tx: Transaction) => ({
      amountCents: cents(tx.amount), date: new Date(`${tx.date}T00:00:00.000Z`), name: tx.name, merchant: tx.merchant_name ?? null,
      category: tx.personal_finance_category?.primary ?? null, pending: tx.pending,
    });
    await prisma.$transaction(async tx => {
      for (const account of fresh.accounts) await tx.bankAccount.updateMany({ where: { plaidAccountId: account.account_id, connectionId }, data: { balanceCents: signedBalance(account) } });
      for (const item of [...result.added, ...result.modified]) {
        const accountId = accountIds.get(item.account_id);
        if (!accountId) continue;
        const next = toRow(item);
        const previous = await tx.bankTransaction.findUnique({ where: { plaidTransactionId: item.transaction_id }, select: { id: true, amountCents: true } });
        // A changed bank total must be reviewed again rather than silently excluded.
        await tx.expense.updateMany({ where: { bankTransaction: { plaidTransactionId: item.transaction_id, amountCents: { not: next.amountCents } } }, data: { bankTransactionId: null } });
        if (previous && previous.amountCents !== next.amountCents) {
          await tx.bankTransactionSplit.deleteMany({ where: { bankTransactionId: previous.id } });
          await tx.bankTransaction.update({ where: { id: previous.id }, data: { reviewedAt: null } });
        }
        await tx.bankTransaction.upsert({ where: { plaidTransactionId: item.transaction_id }, create: { ...next, accountId, plaidTransactionId: item.transaction_id }, update: next });
      }
      const removedIds = result.removed.map(item => item.transaction_id).filter((id): id is string => !!id);
      await tx.bankTransaction.deleteMany({ where: { plaidTransactionId: { in: removedIds }, account: { connectionId } } });
      await tx.bankConnection.update({ where: { id: connectionId }, data: { syncCursor: result.cursor, lastSyncedAt: new Date(), status: 'ACTIVE', statusDetail: null } });
    });
    return result.added.length;
  } catch (error) {
    const code = plaidErrorCode(error);
    if (code && REAUTH_CODES.has(code)) {
      await prisma.bankConnection.update({ where: { id: connectionId }, data: { status: 'NEEDS_ATTENTION', statusDetail: 'Consent expired' } });
    }
    throw error;
  }
}
