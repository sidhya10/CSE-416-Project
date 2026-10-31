import { CountryCode, Products, type AccountBase, type RemovedTransaction, type Transaction } from 'plaid';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { decryptToken, encryptToken } from './bank.crypto.js';
import { BankingError, plaid, plaidErrorCode } from './plaid.client.js';
import { CATEGORY_KEYS, automaticExclusionReason, categorize, requiresCategoryReview, type CategoryKey } from '../budgets/budget.categories.js';
import { automaticExpenseMatch, automaticSettlementMatch, merchantSimilarity } from './bank.matching.js';

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

export type ExpenseMatchInput = { amountCents: number; date?: string; merchant?: string; query?: string };

// Suggestions remain available as the manual fallback when an exact automatic match is ambiguous.
export async function suggestExpenseMatches(userId: string, input: ExpenseMatchInput) {
  const expenseDate = input.date ? new Date(`${input.date}T00:00:00.000Z`) : null;
  const day = 86_400_000;
  const start = new Date((expenseDate?.getTime() ?? 0) - 14 * day);
  const end = new Date((expenseDate?.getTime() ?? 0) + 14 * day);
  const tolerance = Math.max(100, Math.min(1_000, Math.round(input.amountCents * 0.1)));
  const rows = await prisma.bankTransaction.findMany({
    where: {
      pending: false,
      excluded: false,
      autoExcludedReason: null,
      amountCents: { gt: 0, gte: Math.max(1, input.amountCents - tolerance), lte: input.amountCents + tolerance },
      ...(expenseDate ? { date: { gte: start, lte: end } } : {}),
      ...(input.query ? { OR: [{ merchant: { contains: input.query, mode: 'insensitive' as const } }, { name: { contains: input.query, mode: 'insensitive' as const } }] } : {}),
      linkedExpense: null,
      settlementTransaction: null,
      account: { hidden: false, connection: { userId } },
    },
    include: { account: { include: { connection: { select: { institutionName: true } } } } },
    orderBy: [{ date: 'desc' }, { id: 'asc' }],
  });
  return rows.map(row => {
    const amountDifferenceCents = Math.abs(row.amountCents - input.amountCents);
    const dateDifferenceDays = expenseDate ? Math.round(Math.abs(row.date.getTime() - expenseDate.getTime()) / day) : null;
    const similarity = input.merchant?.trim() ? merchantSimilarity(input.merchant, `${row.merchant ?? ''} ${row.name}`) : 0;
    const amountScore = amountDifferenceCents === 0 ? 70 : Math.max(0, 45 * (1 - amountDifferenceCents / tolerance));
    const score = amountScore + (dateDifferenceDays === null ? 0 : Math.max(0, 20 - dateDifferenceDays * 2)) + similarity * 10;
    const reasons = [
      amountDifferenceCents === 0 ? 'Exact amount' : `Amount differs by $${(amountDifferenceCents / 100).toFixed(2)}`,
      ...(dateDifferenceDays === null ? [] : [dateDifferenceDays === 0 ? 'Same date' : `${dateDifferenceDays} day${dateDifferenceDays === 1 ? '' : 's'} apart`]),
      ...(similarity >= 0.5 ? ['Similar merchant'] : []),
    ];
    return {
      id: row.id, merchant: row.merchant ?? row.name, name: row.name, amountCents: row.amountCents,
      date: row.date.toISOString().slice(0, 10), accountName: row.account.nickname ?? row.account.name,
      institution: row.account.connection.institutionName, score: Math.round(score), reasons,
    };
  }).sort((a, b) => b.score - a.score || b.date.localeCompare(a.date)).slice(0, 20);
}

export type TransactionReviewStatus = 'all' | 'unreviewed' | 'reviewed' | 'excluded';
export type TransactionReviewPatch = {
  category: CategoryKey | 'income' | null;
  excluded: boolean;
  note: string | null;
  reviewed: boolean;
  splits: { category: CategoryKey; amountCents: number }[];
};

const presentedCategory = (row: { categoryOverride: string | null; category: string | null; name: string; merchant: string | null }) =>
  row.categoryOverride?.toLowerCase() === 'income' || row.category?.toUpperCase() === 'INCOME'
    ? 'income' as const
    : row.categoryOverride && CATEGORY_KEYS.includes(row.categoryOverride as CategoryKey)
    ? row.categoryOverride as CategoryKey
    : categorize(row);

const transactionReviewInclude = {
  account: { include: { connection: { select: { institutionName: true } } } },
  linkedExpense: { select: { id: true, title: true } },
  settlementTransaction: { include: {
    group: { select: { id: true, name: true } },
    recipient: { select: { id: true, name: true } },
    payments: { where: { status: { not: 'ISSUE' as const } }, include: { share: { select: { budgetCategory: true } } } },
  } },
  reviewSplits: { orderBy: { position: 'asc' as const } },
} satisfies Prisma.BankTransactionInclude;
type TransactionReviewRow = Prisma.BankTransactionGetPayload<{ include: typeof transactionReviewInclude }>;
const presentTransaction = (row: TransactionReviewRow) => {
  const settlementCategories = [...new Set(row.settlementTransaction?.payments.map(payment => payment.share.budgetCategory) ?? [])];
  const category = row.settlementTransaction
    ? (settlementCategories.length === 1 && CATEGORY_KEYS.includes(settlementCategories[0] as CategoryKey) ? settlementCategories[0] as CategoryKey : 'other')
    : presentedCategory(row);
  return ({
  id: row.id,
  source: 'bank' as const,
  accountId: row.accountId,
  accountName: row.account.nickname ?? row.account.name,
  institution: row.account.connection.institutionName,
  merchant: row.merchant ?? row.name,
  name: row.name,
  date: row.date.toISOString().slice(0, 10),
  amountCents: row.amountCents,
  pending: row.pending,
  providerCategory: row.category,
  category,
  excluded: row.excluded,
  note: row.reviewNote,
  reviewed: !row.needsReview,
  needsReview: row.needsReview,
  reviewedAt: row.reviewedAt?.getTime() ?? null,
  linkedExpense: row.linkedExpense,
  groupPayment: row.settlementTransaction ? { id: row.settlementTransaction.id, groupId: row.settlementTransaction.group.id, groupName: row.settlementTransaction.group.name, recipientName: row.settlementTransaction.recipient.name, method: row.settlementTransaction.method } : null,
  splits: row.reviewSplits.map(split => ({ id: split.id, category: split.category as CategoryKey, amountCents: split.amountCents })),
  });
};

export async function listTransactions(userId: string, filters: { query?: string; status: TransactionReviewStatus }) {
  const query = filters.query?.trim();
  const rows = await prisma.bankTransaction.findMany({
    where: {
      account: { connection: { userId } },
      autoExcludedReason: null,
      ...(filters.status === 'unreviewed' ? { needsReview: true, excluded: false }
        : filters.status === 'reviewed' ? { needsReview: false, excluded: false }
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
  const synthetic = await prisma.personalSettlementTransaction.findMany({
    where: {
      userId, bankTransactionId: null, payments: { some: { status: { not: 'ISSUE' } } },
      ...(query ? { OR: [
        { method: { contains: query, mode: 'insensitive' } },
        { group: { name: { contains: query, mode: 'insensitive' } } },
        { recipient: { name: { contains: query, mode: 'insensitive' } } },
      ] } : {}),
      ...(filters.status === 'unreviewed' || filters.status === 'excluded' ? { id: '__none__' } : {}),
    },
    include: { group: { select: { id: true, name: true } }, recipient: { select: { name: true } }, payments: { where: { status: { not: 'ISSUE' } }, include: { share: { select: { budgetCategory: true } } } } },
    orderBy: [{ sentAt: 'desc' }, { id: 'desc' }], take: 200,
  });
  const syntheticRows = synthetic.map(row => {
    const categories = [...new Set(row.payments.map(payment => payment.share.budgetCategory))];
    const category = categories.length === 1 && CATEGORY_KEYS.includes(categories[0] as CategoryKey) ? categories[0] as CategoryKey : 'other';
    const activeAmountCents = row.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
    return {
      id: `settlement:${row.id}`, source: 'group_payment' as const, accountId: '', accountName: row.method, institution: 'Group payment',
      merchant: `${row.group.name} repayment`, name: `Paid ${row.recipient.name}`, date: row.sentAt.toISOString().slice(0, 10), amountCents: activeAmountCents,
      pending: false, providerCategory: null, category, excluded: false, note: `Sent via ${row.method} to ${row.recipient.name}`,
      reviewed: true, needsReview: false, reviewedAt: row.sentAt.getTime(), linkedExpense: null,
      groupPayment: { id: row.id, groupId: row.group.id, groupName: row.group.name, recipientName: row.recipient.name, method: row.method }, splits: [],
    };
  });
  return [...rows.map(presentTransaction), ...syntheticRows].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 200);
}

export async function reviewTransaction(userId: string, id: string, patch: TransactionReviewPatch) {
  const row = await prisma.bankTransaction.findFirst({ where: { id, account: { connection: { userId } } } });
  if (!row) throw new BankingError('Transaction not found', 404);
  if (patch.category === 'income' && row.amountCents >= 0) throw new BankingError('Only deposits can be counted as income', 400);
  if (row.amountCents <= 0 && patch.category && patch.category !== 'income') throw new BankingError('Deposits cannot use a spending category', 400);
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
        needsReview: !patch.reviewed,
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
    const toRow = (plaidTransaction: Transaction) => {
      const base = {
        amountCents: cents(plaidTransaction.amount), date: new Date(`${plaidTransaction.date}T00:00:00.000Z`), name: plaidTransaction.name,
        merchant: plaidTransaction.merchant_name ?? null, category: plaidTransaction.personal_finance_category?.primary ?? null, pending: plaidTransaction.pending,
      };
      return { ...base, needsReview: requiresCategoryReview(base), autoExcludedReason: automaticExclusionReason(base) };
    };
    await prisma.$transaction(async tx => {
      for (const account of fresh.accounts) await tx.bankAccount.updateMany({ where: { plaidAccountId: account.account_id, connectionId }, data: { balanceCents: signedBalance(account) } });
      for (const item of [...result.added, ...result.modified]) {
        const accountId = accountIds.get(item.account_id);
        if (!accountId) continue;
        const next = toRow(item);
        const previous = await tx.bankTransaction.findUnique({ where: { plaidTransactionId: item.transaction_id }, select: { id: true, amountCents: true, reviewedAt: true, autoExcludedReason: true } });
        // A changed bank total must be reviewed again rather than silently excluded.
        await tx.expense.updateMany({ where: { bankTransaction: { plaidTransactionId: item.transaction_id, amountCents: { not: next.amountCents } } }, data: { bankTransactionId: null } });
        if (previous && previous.amountCents !== next.amountCents) {
          await tx.bankTransactionSplit.deleteMany({ where: { bankTransactionId: previous.id } });
        }
        const autoExcluded = !!next.autoExcludedReason;
        await tx.bankTransaction.upsert({
          where: { plaidTransactionId: item.transaction_id },
          create: { ...next, excluded: autoExcluded, reviewedAt: next.needsReview ? null : new Date(), accountId, plaidTransactionId: item.transaction_id },
          update: {
            ...next, reviewedAt: next.needsReview ? null : previous?.reviewedAt ?? new Date(),
            ...(autoExcluded ? { excluded: true } : previous?.autoExcludedReason ? { excluded: false } : {}),
          },
        });
      }
      const removedIds = result.removed.map(item => item.transaction_id).filter((id): id is string => !!id);
      await tx.bankTransaction.deleteMany({ where: { plaidTransactionId: { in: removedIds }, account: { connectionId } } });
      await tx.bankConnection.update({ where: { id: connectionId }, data: { syncCursor: result.cursor, lastSyncedAt: new Date(), status: 'ACTIVE', statusDetail: null } });
    });
    await reconcileAutomaticMatches(connection.userId);
    return result.added.length;
  } catch (error) {
    const code = plaidErrorCode(error);
    if (code && REAUTH_CODES.has(code)) {
      await prisma.bankConnection.update({ where: { id: connectionId }, data: { status: 'NEEDS_ATTENTION', statusDetail: 'Consent expired' } });
    }
    throw error;
  }
}

async function reconcileAutomaticMatches(userId: string) {
  await prisma.$transaction(async tx => {
    const expenses = await tx.expense.findMany({
      where: { paidByUserId: userId, bankTransactionId: null },
      select: { id: true, totalCents: true, expenseDate: true, title: true }, orderBy: { expenseDate: 'desc' }, take: 100,
    });
    for (const expense of expenses) {
      const match = await automaticExpenseMatch(tx, userId, { amountCents: expense.totalCents, date: expense.expenseDate, merchant: expense.title });
      if (!match) continue;
      await tx.expense.update({ where: { id: expense.id }, data: { bankTransactionId: match, budgetLinkReviewed: true } });
      await tx.budgetNotice.updateMany({ where: { expenseId: expense.id, recipientId: userId, readAt: null, deletedAt: null }, data: { readAt: new Date() } });
    }
    const settlements = await tx.personalSettlementTransaction.findMany({
      where: { userId, bankTransactionId: null, payments: { some: { status: { not: 'ISSUE' } } }, sentAt: { gte: new Date(Date.now() - 60 * 86_400_000) } },
      include: { recipient: { select: { name: true } } }, orderBy: { sentAt: 'desc' }, take: 100,
    });
    for (const settlement of settlements) {
      const match = await automaticSettlementMatch(tx, userId, { amountCents: settlement.amountCents, date: settlement.sentAt, method: settlement.method, recipientName: settlement.recipient.name });
      if (match) await tx.personalSettlementTransaction.update({ where: { id: settlement.id }, data: { bankTransactionId: match } });
    }
  });
}
