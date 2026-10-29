import { CountryCode, Products, type AccountBase, type RemovedTransaction, type Transaction } from 'plaid';
import { prisma } from '../../config/database.js';
import { decryptToken, encryptToken } from './bank.crypto.js';
import { BankingError, plaid, plaidErrorCode } from './plaid.client.js';

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
        // A changed bank total must be reviewed again rather than silently excluded.
        await tx.expense.updateMany({ where: { bankTransaction: { plaidTransactionId: item.transaction_id, amountCents: { not: toRow(item).amountCents } } }, data: { bankTransactionId: null } });
        await tx.bankTransaction.upsert({ where: { plaidTransactionId: item.transaction_id }, create: { ...toRow(item), accountId, plaidTransactionId: item.transaction_id }, update: toRow(item) });
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
