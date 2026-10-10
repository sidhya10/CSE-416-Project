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
