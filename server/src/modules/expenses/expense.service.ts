import { validateReceipt } from '../receipts/receipt.validation.js';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { calculateExpense, type ExpenseInput } from './expense.validation.js';

import { ExpenseError } from './expense.error.js';
export { ExpenseError } from './expense.error.js';
export type Transaction = Prisma.TransactionClient;
export const expenseInclude = {
  receipt: { select: { name: true, mimeType: true } },
  creator: { select: { id: true, name: true } },
  items: { orderBy: { position: 'asc' }, include: { assignments: true } },
  shares: { orderBy: { position: 'asc' }, include: { user: { select: { id: true, name: true } }, payments: { orderBy: { sentAt: 'asc' } } } },
} satisfies Prisma.ExpenseInclude;

// Conflicting financial writes roll back; clients reload before retrying an edit.
export function transaction<T>(work: (tx: Transaction) => Promise<T>) {
  return prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
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
  return {
    title: input.title, paidByUserId: input.paidByUserId, expenseDate: new Date(`${input.expenseDate}T00:00:00.000Z`),
    splitMode: input.splitMode, taxCents: input.taxCents, tipCents: input.tipCents, otherCents: input.otherCents,
    totalCents: calculateExpense(input).totalCents,
  };
}

export function createExpense(groupId: string, userId: string, clientRequestId: string, input: ExpenseInput) {
  return transaction(async tx => {
    await requireMember(tx, groupId, userId);
    const previous = await tx.expense.findUnique({ where: { createdByUserId_clientRequestId: { createdByUserId: userId, clientRequestId } }, include: expenseInclude });
    if (previous) {
      if (previous.groupId !== groupId) throw new ExpenseError(409, 'Request ID already used for another group');
      return previous;
    }
    await validateMembers(tx, groupId, input);
    const expense = await tx.expense.create({ data: { groupId, createdByUserId: userId, clientRequestId, ...expenseFields(input) } });
    await writeItemsAndShares(tx, expense.id, input);
    await writeReceipt(tx, expense.id, input);
    return readExpense(tx, expense.id, userId);
  });
}

export function editExpense(id: string, userId: string, version: number, input: ExpenseInput) {
  return transaction(async tx => {
    const previous = await readExpense(tx, id, userId);
    if (previous.createdByUserId !== userId && previous.paidByUserId !== userId) throw new ExpenseError(403, 'Only the creator or payer can edit this expense');
    if (previous.version !== version) throw new ExpenseError(409, 'Expense changed; reload before editing');
    if (previous.shares.some(share => share.payments.length)) throw new ExpenseError(409, 'Expenses with payment history cannot be edited yet');
    await validateMembers(tx, previous.groupId, input);
    await tx.expense.update({ where: { id }, data: { ...expenseFields(input), version: { increment: 1 } } });
    await tx.expenseItem.deleteMany({ where: { expenseId: id } });
    await tx.expenseShare.deleteMany({ where: { expenseId: id } });
    await writeItemsAndShares(tx, id, input);
    await writeReceipt(tx, id, input);
    return readExpense(tx, id, userId);
  });
}

export function sendPayment(expenseId: string, userId: string, amountCents: number, clientRequestId: string) {
  return transaction(async tx => {
    const expense = await readExpense(tx, expenseId, userId);
    if (expense.paidByUserId === userId) throw new ExpenseError(400, 'The expense payer does not reimburse themselves');
    const share = expense.shares.find(entry => entry.userId === userId);
    if (!share) throw new ExpenseError(403, 'You do not have a share in this expense');
    const previous = await tx.expensePayment.findUnique({ where: { senderUserId_clientRequestId: { senderUserId: userId, clientRequestId } } });
    if (previous) {
      if (previous.expenseId !== expenseId || previous.amountCents !== amountCents) throw new ExpenseError(409, 'Request ID already used for another payment');
      return previous;
    }
    const committed = share.payments.filter(payment => payment.status !== 'ISSUE').reduce((sum, payment) => sum + payment.amountCents, 0);
    if (amountCents > share.totalCents - committed) throw new ExpenseError(409, 'Payment exceeds the remaining unreported amount');
    return tx.expensePayment.create({ data: { expenseId, senderUserId: userId, amountCents, clientRequestId } });
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
