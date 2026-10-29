import { categorize } from '../budgets/budget.categories.js';
import { ExpenseError } from './expense.service.js';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/requireAuth.js';
import { prisma } from '../../config/database.js';
import { createExpenseInput, editExpenseInput } from './expense.validation.js';
import { createExpense, editExpense, expenseInclude, groupBalances, readExpense, requireMember, resolvePayment, sendPayment, transaction } from './expense.service.js';

export const expensesRouter = Router();
expensesRouter.use(requireAuth);
expensesRouter.get('/groups/:groupId/expenses', async (req, res) => {
  const expenses = await transaction(async tx => {
    await requireMember(tx, req.params.groupId, req.userId!);
    return tx.expense.findMany({ where: { groupId: req.params.groupId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: expenseInclude });
  });
  res.json({ expenses });
});
expensesRouter.post('/groups/:groupId/expenses', async (req, res) => {
  const input = createExpenseInput.parse(req.body);
  const expense = await createExpense(req.params.groupId, req.userId!, input.clientRequestId, input.expense);
  res.status(201).json({ expense });
});
expensesRouter.get('/groups/:groupId/balances', async (req, res) => {
  res.json({ balances: await groupBalances(req.params.groupId, req.userId!) });
});
expensesRouter.get('/expenses/:id', async (req, res) => {
  res.json({ expense: await readExpense(prisma, req.params.id, req.userId!) });
});
expensesRouter.put('/expenses/:id', async (req, res) => {
  const input = editExpenseInput.parse(req.body);
  res.json({ expense: await editExpense(req.params.id, req.userId!, input.version, input.expense) });
});
expensesRouter.post('/expenses/:id/payments', async (req, res) => {
  const input = z.object({ amountCents: z.number().int().positive().max(2_000_000_000), clientRequestId: z.uuid() }).strict().parse(req.body);
  res.status(201).json({ payment: await sendPayment(req.params.id, req.userId!, input.amountCents, input.clientRequestId) });
});
expensesRouter.patch('/expenses/:id/payments/:paymentId', async (req, res) => {
  const input = z.object({ status: z.enum(['CONFIRMED', 'ISSUE']) }).strict().parse(req.body);
  res.json({ payment: await resolvePayment(req.params.id, req.params.paymentId, req.userId!, input.status) });
});

expensesRouter.get('/expenses/:id/receipt', async (req, res) => {
  const receipt = await prisma.expenseReceipt.findFirst({ where: { expenseId: req.params.id, expense: { group: { memberships: { some: { userId: req.userId! } } } } } });
  if (!receipt) { res.status(404).json({ error: 'Receipt not found' }); return; }
  res.set({ 'Content-Type': receipt.mimeType, 'Cache-Control': 'private, no-store', 'Content-Disposition': `inline; filename="receipt.${receipt.mimeType === 'application/pdf' ? 'pdf' : 'jpg'}"` });
  res.send(Buffer.from(receipt.data));
});

// Bank details are returned only to the payer, never to other group members.
expensesRouter.get('/expenses/:id/budget-link', async (req, res) => {
  const expense = await readExpense(prisma, req.params.id, req.userId!);
  const canLink = expense.paidByUserId === req.userId;
  const candidates = canLink ? await prisma.bankTransaction.findMany({
    where: { pending: false, amountCents: { gt: 0 }, account: { hidden: false, connection: { userId: req.userId! } }, OR: [{ linkedExpense: null }, { linkedExpense: { id: expense.id } }] },
    select: { id: true, name: true, merchant: true, amountCents: true, date: true, pending: true, category: true }, orderBy: { date: 'desc' },
  }) : [];
  res.json({ reviewed: expense.budgetLinkReviewed, expenseTotalCents: expense.totalCents, category: expense.shares.find(s => s.userId === req.userId)?.budgetCategory ?? 'other', linked: !!expense.bankTransactionId, transactionId: canLink ? expense.bankTransactionId : null, canLink, ownShareCents: expense.shares.find(s => s.userId === req.userId)?.totalCents ?? 0, candidates: candidates.map(t => ({ ...t, category: categorize(t) ?? 'other' })) });
});
expensesRouter.put('/expenses/:id/budget-link', async (req, res) => {
  const input = z.object({ category: z.enum(['dining', 'groceries', 'transit', 'shopping', 'other']).optional(), transactionId: z.string().min(1).nullable() }).strict().parse(req.body);
  await transaction(async tx => {
    const expense = await readExpense(tx, req.params.id, req.userId!);
    if (expense.paidByUserId !== req.userId) throw new ExpenseError(403, 'Only the payer can link their bank transaction');
    if (input.transactionId) {
      const bank = await tx.bankTransaction.findFirst({ where: { id: input.transactionId, pending: false, amountCents: { gt: 0 }, account: { connection: { userId: req.userId! } } }, include: { linkedExpense: { select: { id: true } } } });
      if (!bank || (bank.linkedExpense && bank.linkedExpense.id !== expense.id)) throw new ExpenseError(409, 'Choose an available posted charge from your own account.');
    }
    await tx.expense.update({ where: { id: expense.id }, data: { budgetLinkReviewed: true, bankTransactionId: input.transactionId, version: { increment: 1 } } });
  });
  res.status(204).end();
});

expensesRouter.put('/expenses/:id/budget-category', async (req, res) => {
  const { category } = z.object({ category: z.enum(['dining', 'groceries', 'transit', 'shopping', 'other']) }).strict().parse(req.body);
  await transaction(async tx => {
    const expense = await readExpense(tx, req.params.id, req.userId!);
    if (!expense.shares.some(s => s.userId === req.userId)) throw new ExpenseError(403, 'Only participants can categorize their share');
    await tx.expenseShare.update({ where: { expenseId_userId: { expenseId: expense.id, userId: req.userId! } }, data: { budgetCategory: category } });
  });
  res.status(204).end();
});
