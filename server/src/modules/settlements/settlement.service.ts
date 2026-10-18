import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { lockMaintenance } from '../../utils/maintenance-lock.js';
import { expenseInclude, ExpenseError, requireMember, transaction, type Transaction } from '../expenses/expense.service.js';

export const methods = ['Venmo', 'Zelle', 'PayPal', 'Cash', 'Bank transfer', 'Other'] as const;
const confirmed = (payments: { status: string; amountCents: number }[]) => payments.filter(p => p.status === 'CONFIRMED').reduce((sum, p) => sum + p.amountCents, 0);
const currency = (cents: number) => `$${(cents / 100).toFixed(2)}`;
export const batchInclude = {
  group: { select: { id: true, name: true } },
  expenses: { select: { id: true, title: true } },
  shares: { include: { source: { include: { user: { select: { id: true, name: true } }, payments: true, expense: { include: { payer: { select: { id: true, name: true } } } } } } } },
} satisfies Prisma.SettlementBatchInclude;
type Batch = Prisma.SettlementBatchGetPayload<{ include: typeof batchInclude }>;

export function presentBatch(batch: Batch) {
  type Pair = { senderId: string; senderName: string; recipientId: string; recipientName: string; amountCents: number; confirmedCents: number; pendingCents: number; unreportedCents: number; pendingPayments: { id: string; cents: number; method: string | null }[] };
  const pairs = new Map<string, Pair>();
  for (const share of batch.shares) {
    const source = share.source, expense = source.expense;
    const key = `${share.userId}:${expense.paidByUserId}`;
    const pair = pairs.get(key) ?? { senderId: share.userId, senderName: source.user.name, recipientId: expense.paidByUserId, recipientName: expense.payer.name, amountCents: 0, confirmedCents: 0, pendingCents: 0, unreportedCents: 0, pendingPayments: [] };
    const received = Math.min(share.amountCents, Math.max(0, confirmed(source.payments) - share.baselineConfirmedCents));
    const pending = source.payments.filter(p => p.status === 'SENT');
    const pendingCents = Math.min(share.amountCents - received, pending.reduce((sum, p) => sum + p.amountCents, 0));
    pair.amountCents += share.amountCents; pair.confirmedCents += received; pair.pendingCents += pendingCents;
    pair.unreportedCents += share.amountCents - received - pendingCents;
    pair.pendingPayments.push(...pending.map(p => ({ id: p.id, cents: p.amountCents, method: p.method })));
    pairs.set(key, pair);
  }
  const rows = [...pairs.values()].sort((a, b) => a.recipientName.localeCompare(b.recipientName) || a.senderName.localeCompare(b.senderName));
  return { id: batch.id, groupId: batch.groupId, groupName: batch.group.name, createdAt: batch.createdAt.toISOString(), expenses: batch.expenses,
    totalCents: rows.reduce((sum, p) => sum + p.amountCents, 0), completed: rows.every(p => p.confirmedCents === p.amountCents), pairs: rows };
}
async function readBatch(tx: Transaction, id: string, userId: string) {
  const batch = await tx.settlementBatch.findFirst({ where: { id, group: { memberships: { some: { userId } } } }, include: batchInclude });
  if (!batch) throw new ExpenseError(404, 'Split not found');
  return batch;
}
async function candidates(tx: Transaction, groupId: string, userId: string) {
  await requireMember(tx, groupId, userId);
  const expenses = await tx.expense.findMany({ where: { groupId, settlementBatchId: null }, include: expenseInclude, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  return expenses.map(expense => ({ expense, shares: expense.shares.filter(s => s.userId !== expense.paidByUserId).map(s => ({ userId: s.userId, baselineConfirmedCents: confirmed(s.payments), amountCents: Math.max(0, s.totalCents - confirmed(s.payments)) })).filter(s => s.amountCents > 0) })).filter(e => e.shares.length);
}
export async function previewSettlement(groupId: string, userId: string) {
  return transaction(async tx => {
    const rows = await candidates(tx, groupId, userId);
    return { expenseIds: rows.map(r => r.expense.id), totalCents: rows.reduce((sum, r) => sum + r.shares.reduce((subtotal, s) => subtotal + s.amountCents, 0), 0),
      expenses: rows.map(r => ({ id: r.expense.id, title: r.expense.title, outstandingCents: r.shares.reduce((sum, s) => sum + s.amountCents, 0) })) };
  });
}
export async function initializeSettlement(groupId: string, userId: string, input: { clientRequestId: string; expenseIds: string[]; totalCents: number }) {
  return transaction(async tx => {
    await lockMaintenance(tx); await requireMember(tx, groupId, userId);
    const previous = await tx.settlementBatch.findUnique({ where: { createdById_clientRequestId: { createdById: userId, clientRequestId: input.clientRequestId } }, include: batchInclude });
    if (previous) {
      if (previous.groupId !== groupId || previous.expenses.map(e => e.id).sort().join() !== [...input.expenseIds].sort().join() || presentBatch(previous).totalCents !== input.totalCents) throw new ExpenseError(409, 'Request ID already used for another split');
      return presentBatch(previous);
    }
    const group = await tx.group.findUniqueOrThrow({ where: { id: groupId } });
    if (group.archivedAt) throw new ExpenseError(409, 'Restore the group before initializing a split');
    const rows = await candidates(tx, groupId, userId);
    const total = rows.reduce((sum, r) => sum + r.shares.reduce((subtotal, s) => subtotal + s.amountCents, 0), 0);
    if (rows.map(r => r.expense.id).sort().join() !== [...input.expenseIds].sort().join() || total !== input.totalCents || !rows.length) throw new ExpenseError(409, 'Transactions changed or were already split. Review the current period again.');
    const batch = await tx.settlementBatch.create({ data: { groupId, createdById: userId, clientRequestId: input.clientRequestId,
      expenses: { connect: rows.map(r => ({ id: r.expense.id })) },
      shares: { create: rows.flatMap(r => r.shares.map(s => ({ ...s, expenseId: r.expense.id }))) },
    }, include: batchInclude });
    await tx.group.update({ where: { id: groupId }, data: { lastActivityAt: new Date() } });
    return presentBatch(batch);
  });
}
export async function settlementInbox(userId: string) {
  const [batches, notices] = await Promise.all([
    prisma.settlementBatch.findMany({ where: { group: { memberships: { some: { userId } }, archivedAt: null } }, include: batchInclude, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    prisma.settlementNotice.findMany({ where: { recipientId: userId, readAt: null, batch: { group: { memberships: { some: { userId } } } } }, orderBy: { createdAt: 'desc' }, select: { id: true, batchId: true, message: true, kind: true, createdAt: true } }),
  ]);
  return { userId, batches: batches.map(presentBatch), notices: notices.map(n => ({ ...n, createdAt: n.createdAt.toISOString() })) };
}
export async function reportSettlementPayment(batchId: string, userId: string, input: { recipientId: string; method: string; clientRequestId: string; amountCents: number }) {
  return transaction(async tx => {
    await lockMaintenance(tx);
    const batch = await readBatch(tx, batchId, userId);
    if (input.recipientId === userId) throw new ExpenseError(400, 'You cannot pay yourself');
    const prefix = `period:${batchId}:${input.clientRequestId}:`;
    const previous = await tx.expensePayment.findMany({ where: { senderUserId: userId, clientRequestId: { startsWith: prefix } }, include: { share: { include: { expense: true } } } });
    if (previous.length) {
      if (previous.some(p => p.method !== input.method || p.share.expense.paidByUserId !== input.recipientId) || previous.reduce((sum, p) => sum + p.amountCents, 0) !== input.amountCents) throw new ExpenseError(409, 'Request ID already used for another payment');
      return presentBatch(batch);
    }
    const pair = presentBatch(batch).pairs.find(p => p.senderId === userId && p.recipientId === input.recipientId);
    if (!pair) throw new ExpenseError(403, 'You do not owe this person in this split');
    if (pair.unreportedCents !== input.amountCents || input.amountCents <= 0) throw new ExpenseError(409, 'Payment amount changed. Reload before confirming what you sent.');
    for (const s of batch.shares.filter(s => s.userId === userId && s.source.expense.paidByUserId === input.recipientId)) {
      const committed = s.source.payments.filter(p => p.status !== 'ISSUE').reduce((sum, p) => sum + p.amountCents, 0);
      const amount = Math.max(0, s.source.totalCents - committed);
      if (amount) await tx.expensePayment.create({ data: { expenseId: s.expenseId, senderUserId: userId, amountCents: amount, method: input.method, clientRequestId: `${prefix}${s.expenseId}` } });
    }
    await tx.group.update({ where: { id: batch.groupId }, data: { lastActivityAt: new Date() } });
    return presentBatch(await readBatch(tx, batchId, userId));
  });
}
export async function confirmSettlementPayments(batchId: string, userId: string, input: { senderId: string; paymentIds: string[]; status: 'CONFIRMED' | 'ISSUE' }) {
  return transaction(async tx => {
    await lockMaintenance(tx);
    const batch = await readBatch(tx, batchId, userId);
    const payments = batch.shares.filter(s => s.userId === input.senderId && s.source.expense.paidByUserId === userId).flatMap(s => s.source.payments).filter(p => input.paymentIds.includes(p.id));
    if (payments.length !== input.paymentIds.length) throw new ExpenseError(403, 'Only the recipient can confirm these payments');
    if (payments.some(p => p.status !== 'SENT' && p.status !== input.status)) throw new ExpenseError(409, 'Payment status changed. Reload this split.');
    const changed = payments.filter(p => p.status === 'SENT');
    if (changed.length) {
      await tx.expensePayment.updateMany({ where: { id: { in: changed.map(p => p.id) }, status: 'SENT' }, data: { status: input.status, resolvedAt: new Date() } });
      const payer = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const amount = changed.reduce((sum, p) => sum + p.amountCents, 0);
      await tx.settlementNotice.create({ data: { batchId, actorId: userId, recipientId: input.senderId, kind: input.status, message: input.status === 'CONFIRMED' ? `${payer.name} confirmed receiving ${currency(amount)} for ${batch.group.name}.` : `${payer.name} could not confirm ${currency(amount)} for ${batch.group.name}. Please check the payment before sending again.` } });
      await tx.group.update({ where: { id: batch.groupId }, data: { lastActivityAt: new Date() } });
    }
    return presentBatch(await readBatch(tx, batchId, userId));
  });
}
export async function remindSettlementMember(batchId: string, userId: string, recipientId: string) {
  return transaction(async tx => {
    await lockMaintenance(tx);
    const batch = await readBatch(tx, batchId, userId);
    const pair = presentBatch(batch).pairs.find(p => p.recipientId === userId && p.senderId === recipientId);
    if (!pair || !pair.unreportedCents) throw new ExpenseError(409, 'Reminders are only available for money that has not been reported sent');
    const last = await tx.settlementNotice.findFirst({ where: { batchId, actorId: userId, recipientId, kind: 'REMINDER' }, orderBy: { createdAt: 'desc' } });
    if (last && Date.now() - last.createdAt.getTime() < 60 * 60 * 1000) throw new ExpenseError(429, 'A reminder was already sent. You can remind this person again in an hour.');
    const actor = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    await tx.settlementNotice.create({ data: { batchId, recipientId, actorId: userId, kind: 'REMINDER', message: `${actor.name} reminded you to send ${currency(pair.unreportedCents)} for ${batch.group.name}.` } });
  });
}
