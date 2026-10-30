import { validateReceipt } from '../receipts/receipt.validation.js';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { calculateExpense, type ExpenseInput } from './expense.validation.js';
import { automaticExpenseMatch, automaticSettlementMatch } from '../banking/bank.matching.js';

import { ExpenseError } from './expense.error.js';
export { ExpenseError } from './expense.error.js';
export type Transaction = Prisma.TransactionClient;
export const expenseInclude = {
  receipt: { select: { name: true, mimeType: true } },
  creator: { select: { id: true, name: true } },
  items: { orderBy: { position: 'asc' }, include: { assignments: true } },
  shares: { orderBy: { position: 'asc' }, include: { user: { select: { id: true, name: true } }, payments: { orderBy: { sentAt: 'asc' } } } },
} satisfies Prisma.ExpenseInclude;

// Maintenance and access tracking can conflict with otherwise valid financial writes.
// Retry only serialization/deadlock failures; business/version checks run again inside
// the transaction, so stale edits and overpayments still return a conflict.
export async function transaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 }); }
    catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt >= 4) throw error;
      await new Promise(resolve => setTimeout(resolve, 10 * (attempt + 1)));
    }
  }
}

export async function requireMember(tx: Transaction, groupId: string, userId: string) {
  const member = await tx.groupMembership.findUnique({ where: { groupId_userId: { groupId, userId } } });
  if (!member) throw new ExpenseError(404, 'Group not found');
}

export async function readExpense(tx: Transaction, id: string, userId: string) {
  const expense = await tx.expense.findFirst({ where: { id, group: { memberships: { some: { userId } } } }, include: expenseInclude });
  if (!expense) throw new ExpenseError(404, 'Expense not found');
  return expense;
}

async function validateMembers(tx: Transaction, groupId: string, input: ExpenseInput) {
  const count = await tx.groupMembership.count({ where: { groupId, userId: { in: input.participantIds } } });
  if (count !== input.participantIds.length) throw new ExpenseError(400, 'Every participant must belong to this group');
}

async function writeItemsAndShares(tx: Transaction, expenseId: string, input: ExpenseInput) {
  const calculated = calculateExpense(input);
  await tx.expenseShare.createMany({ data: calculated.shares.map(share => ({ ...share, expenseId })) });
  for (const [position, item] of input.items.entries()) {
    const saved = await tx.expenseItem.create({ data: { expenseId, position, name: item.name, unitPriceCents: item.unitPriceCents, quantity: item.quantity } });
    if (item.assignedUserIds.length) await tx.itemAssignment.createMany({ data: item.assignedUserIds.map(userId => ({ expenseId, itemId: saved.id, userId })) });
  }
}

async function writeReceipt(tx: Transaction, expenseId: string, input: ExpenseInput) {
  if (input.receipt === undefined) return;
  if (input.receipt === null) { await tx.expenseReceipt.deleteMany({ where: { expenseId } }); return; }
  const { name, mimeType, base64 } = input.receipt;
  const bytes = validateReceipt(base64, mimeType);
  if (mimeType === 'image/jpeg' && bytes.length > 1024 * 1024) throw new ExpenseError(400, 'Saved receipt images must be under 1 MB.');
  const data = { name, mimeType, data: new Uint8Array(bytes) };
  await tx.expenseReceipt.upsert({ where: { expenseId }, create: { expenseId, ...data }, update: data });
}

function expenseFields(input: ExpenseInput) {
  const expenseDate = input.expenseDate ? new Date(`${input.expenseDate}T00:00:00.000Z`) : new Date(new Date().toISOString().slice(0, 10));
  return {
    title: input.title, paidByUserId: input.paidByUserId, expenseDate,
    splitMode: input.splitMode, taxCents: input.taxCents, tipCents: input.tipCents, otherCents: input.otherCents,
    totalCents: calculateExpense(input).totalCents,
    ...(input.budgetCategory !== undefined ? { budgetCategory: input.budgetCategory } : {}),
  };
}

async function notifyBudgetPayer(tx: Transaction, expenseId: string, input: ExpenseInput) {
  await tx.budgetNotice.upsert({ where: { expenseId_recipientId: { expenseId, recipientId: input.paidByUserId } },
    create: { expenseId, recipientId: input.paidByUserId, message: `You’re the payer for ${input.title}. Link the bank charge for your budget, or choose No transaction if there isn’t one.` },
    update: { deletedAt: null, readAt: null, message: `You’re the payer for ${input.title}. Link the bank charge for your budget, or choose No transaction if there isn’t one.` } });
}

export function createExpense(groupId: string, userId: string, clientRequestId: string, input: ExpenseInput) {
  return transaction(async tx => {
    await requireMember(tx, groupId, userId);
    const group = await tx.group.findUniqueOrThrow({ where: { id: groupId } });
    if (group.archivedAt) throw new ExpenseError(409, 'Restore the group before adding an expense');
    const previous = await tx.expense.findUnique({ where: { createdByUserId_clientRequestId: { createdByUserId: userId, clientRequestId } }, include: expenseInclude });
    if (previous) {
      if (previous.groupId !== groupId) throw new ExpenseError(409, 'Request ID already used for another group');
      return previous;
    }
    await validateMembers(tx, groupId, input);
    if (input.bankTransactionId) {
      if (input.paidByUserId !== userId) throw new ExpenseError(400, 'Only your own bank charge can be linked while creating an expense');
      const bank = await tx.bankTransaction.findFirst({ where: {
        id: input.bankTransactionId, pending: false, amountCents: { gt: 0 }, linkedExpense: null,
        account: { hidden: false, connection: { userId } },
      } });
      if (!bank) throw new ExpenseError(409, 'That bank transaction is no longer available. Refresh the suggestions and try again.');
    }
    const fields = expenseFields(input);
    const automaticBankTransactionId = !input.bankTransactionId && input.paidByUserId === userId
      ? await automaticExpenseMatch(tx, userId, { amountCents: fields.totalCents, date: fields.expenseDate, merchant: input.title }) : null;
    const bankTransactionId = input.bankTransactionId ?? automaticBankTransactionId;
    const expense = await tx.expense.create({ data: {
      groupId, createdByUserId: userId, clientRequestId, ...fields,
      bankTransactionId, budgetLinkReviewed: !!bankTransactionId,
    } });
    await tx.group.update({ where: { id: groupId }, data: { lastActivityAt: new Date() } });
    await writeItemsAndShares(tx, expense.id, input);
    if (input.budgetCategory) await tx.expenseShare.updateMany({ where: { expenseId: expense.id, userId }, data: { budgetCategory: input.budgetCategory } });
    await writeReceipt(tx, expense.id, input);
    if (!bankTransactionId) await notifyBudgetPayer(tx, expense.id, input);
    return readExpense(tx, expense.id, userId);
  });
}

export function editExpense(id: string, userId: string, version: number, input: ExpenseInput) {
  return transaction(async tx => {
    const previous = await readExpense(tx, id, userId);
    if (previous.settlementBatchId) throw new ExpenseError(409, 'This expense belongs to an initialized split. Its recorded shares cannot be changed.');
    if (previous.recurringBillId || previous.splitMode === 'CUSTOM') throw new ExpenseError(409, 'Past recurring expenses keep their recorded payer and shares. Update upcoming expenses from the schedule.');
    if (previous.createdByUserId !== userId && previous.paidByUserId !== userId) throw new ExpenseError(403, 'Only the creator or payer can edit this expense');
    if (previous.version !== version) throw new ExpenseError(409, 'Expense changed; reload before editing');
    if (previous.shares.some(share => share.payments.length)) throw new ExpenseError(409, 'Expenses with payment history cannot be edited yet');
    await tx.group.update({ where: { id: previous.groupId }, data: { lastActivityAt: new Date() } });
    await validateMembers(tx, previous.groupId, input);
    await tx.expense.update({ where: { id }, data: { ...expenseFields(input), bankTransactionId: input.paidByUserId !== previous.paidByUserId || expenseFields(input).totalCents !== previous.totalCents ? null : previous.bankTransactionId, version: { increment: 1 } } });
    await tx.expenseItem.deleteMany({ where: { expenseId: id } });
    await tx.expenseShare.deleteMany({ where: { expenseId: id } });
    await writeItemsAndShares(tx, id, input);
    for (const share of previous.shares) await tx.expenseShare.updateMany({ where: { expenseId: id, userId: share.userId }, data: { budgetCategory: share.userId === userId ? input.budgetCategory ?? share.budgetCategory : share.budgetCategory } });
    await writeReceipt(tx, id, input);
    if (previous.paidByUserId !== input.paidByUserId) {
      await tx.budgetNotice.deleteMany({ where: { expenseId: id } });
      await tx.expense.update({ where: { id }, data: { budgetLinkReviewed: false } });
      await notifyBudgetPayer(tx, id, input);
    }
    return readExpense(tx, id, userId);
  });
}

export function sendPayment(expenseId: string, userId: string, amountCents: number, clientRequestId: string, method = 'Other') {
  return transaction(async tx => {
    const expense = await readExpense(tx, expenseId, userId);
    if (expense.paidByUserId === userId) throw new ExpenseError(400, 'The expense payer does not reimburse themselves');
    const share = expense.shares.find(entry => entry.userId === userId);
    if (!share) throw new ExpenseError(403, 'You do not have a share in this expense');
    const previous = await tx.expensePayment.findUnique({ where: { senderUserId_clientRequestId: { senderUserId: userId, clientRequestId } } });
    if (previous) {
      if (previous.expenseId !== expenseId || previous.amountCents !== amountCents || (previous.method ?? 'Other') !== method) throw new ExpenseError(409, 'Request ID already used for another payment');
      return previous;
    }
    const committed = share.payments.filter(payment => payment.status !== 'ISSUE').reduce((sum, payment) => sum + payment.amountCents, 0);
    if (amountCents > share.totalCents - committed) throw new ExpenseError(409, 'Payment exceeds the remaining unreported amount');
    await tx.group.update({ where: { id: expense.groupId }, data: { lastActivityAt: new Date() } });
    const recipient = await tx.user.findUniqueOrThrow({ where: { id: expense.paidByUserId }, select: { name: true } });
    const sentAt = new Date();
    const bankTransactionId = await automaticSettlementMatch(tx, userId, { amountCents, date: sentAt, method, recipientName: recipient.name });
    const personal = await tx.personalSettlementTransaction.create({ data: {
      userId, recipientUserId: expense.paidByUserId, groupId: expense.groupId, amountCents, method, sentAt,
      requestKey: `expense:${expenseId}:${clientRequestId}`, bankTransactionId,
    } });
    const payment = await tx.expensePayment.create({ data: { expenseId, senderUserId: userId, amountCents, method, clientRequestId, sentAt, personalSettlementTransactionId: personal.id } });
    if (expense.settlementBatchId) {
      const sender = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });
      await tx.settlementNotice.create({ data: { batchId: expense.settlementBatchId, recipientId: expense.paidByUserId, actorId: userId, kind: 'PAYMENT_SENT',
        message: `${sender.name} reported sending you $${(amountCents / 100).toFixed(2)} for ${expense.title}. Please confirm once you have received the money.` } });
    }
    return payment;
  });
}

export function resolvePayment(expenseId: string, paymentId: string, userId: string, status: 'CONFIRMED' | 'ISSUE') {
  return transaction(async tx => {
    const expense = await readExpense(tx, expenseId, userId);
    if (expense.paidByUserId !== userId) throw new ExpenseError(403, 'Only the expense payer can confirm or flag a payment');
    const payment = expense.shares.flatMap(share => share.payments).find(entry => entry.id === paymentId);
    if (!payment) throw new ExpenseError(404, 'Payment not found');
    if (payment.status === status) return payment;
    if (payment.status !== 'SENT') throw new ExpenseError(409, 'Payment has already been resolved');
    await tx.group.update({ where: { id: expense.groupId }, data: { lastActivityAt: new Date() } });
    if (expense.settlementBatchId) await tx.settlementNotice.create({ data: { batchId: expense.settlementBatchId, recipientId: payment.senderUserId, actorId: userId, kind: status,
      message: status === 'CONFIRMED' ? `Your $${(payment.amountCents / 100).toFixed(2)} payment for ${expense.title} was confirmed.` : `Your payment for ${expense.title} needs review. Please check before sending again.` } });
    return tx.expensePayment.update({ where: { id: paymentId }, data: { status, resolvedAt: new Date() } });
  });
}

// Expense shares and confirmed payments form the ledger; no mutable balance column.
export function groupBalances(groupId: string, userId: string) {
  return transaction(async tx => {
    await requireMember(tx, groupId, userId);
    const members = await tx.groupMembership.findMany({ where: { groupId } });
    const expenses = await tx.expense.findMany({ where: { groupId }, include: expenseInclude });
    const ids = new Set([...members.map(member => member.userId), ...expenses.flatMap(expense => expense.shares.map(share => share.userId))]);
    const balances = new Map([...ids].map(userId => [userId, { userId, balanceCents: 0, spendingCents: 0 }]));
    for (const expense of expenses) {
      const payer = balances.get(expense.paidByUserId)!;
      payer.balanceCents += expense.totalCents;
      for (const share of expense.shares) {
        const member = balances.get(share.userId)!;
        member.spendingCents += share.totalCents;
        member.balanceCents -= share.totalCents;
        for (const payment of share.payments) if (payment.status === 'CONFIRMED') {
          member.balanceCents += payment.amountCents;
          payer.balanceCents -= payment.amountCents;
        }
      }
    }
    return [...balances.values()];
  });
}
