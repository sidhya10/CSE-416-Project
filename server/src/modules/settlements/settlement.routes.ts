import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/requireAuth.js';
import { prisma } from '../../config/database.js';
import { ExpenseError } from '../expenses/expense.service.js';
import { confirmGroupPayments, reportGroupPayment, remindGroupMember, confirmSettlementPayments, initializeSettlement, methods, previewSettlement, remindSettlementMember, reportSettlementPayment, settlementInbox } from './settlement.service.js';
export const settlementsRouter = Router();
settlementsRouter.use(requireAuth);
const id = z.string().min(1).max(100);
const cents = z.number().int().positive().max(2_000_000_000);
settlementsRouter.get('/settlement-notices', async (req, res) => {
  const notices = await prisma.settlementNotice.findMany({
    where: { recipientId: req.userId!, batch: { group: { memberships: { some: { userId: req.userId! } } } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, message: true, kind: true, createdAt: true, readAt: true, batch: { select: { groupId: true } } },
  });
  const budgetNotices = await prisma.budgetNotice.findMany({ where: { recipientId: req.userId!, expense: { paidByUserId: req.userId!, group: { memberships: { some: { userId: req.userId! } } } } }, include: { expense: { select: { groupId: true } } } });
  res.json({ notices: [...notices.map(({ batch, ...notice }) => ({ ...notice, groupId: batch.groupId })), ...budgetNotices.map(({ expense, ...notice }) => ({ ...notice, kind: 'BUDGET_LINK', groupId: expense.groupId }))].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()) });
});
settlementsRouter.get('/settlements', async (req, res) => { res.json(await settlementInbox(req.userId!)); });
settlementsRouter.get('/groups/:id/settlements/preview', async (req, res) => { res.json(await previewSettlement(req.params.id, req.userId!)); });
settlementsRouter.post('/groups/:id/settlements', async (req, res) => {
  const input = z.object({ clientRequestId: z.uuid(), expenseIds: z.array(id).min(1).max(500).refine(ids => new Set(ids).size === ids.length), totalCents: cents }).strict().parse(req.body);
  res.status(201).json({ batch: await initializeSettlement(req.params.id, req.userId!, input) });
});
settlementsRouter.post('/settlements/:id/payments', async (req, res) => {
  const input = z.object({ recipientId: id, method: z.enum(methods), clientRequestId: z.uuid(), amountCents: cents }).strict().parse(req.body);
  res.json({ batch: await reportSettlementPayment(req.params.id, req.userId!, input) });
});
settlementsRouter.post('/settlements/:id/confirm', async (req, res) => {
  const input = z.object({ senderId: id, paymentIds: z.array(id).min(1).max(500).refine(ids => new Set(ids).size === ids.length), status: z.enum(['CONFIRMED', 'ISSUE']) }).strict().parse(req.body);
  res.json({ batch: await confirmSettlementPayments(req.params.id, req.userId!, input) });
});
settlementsRouter.post('/settlements/:id/reminders', async (req, res) => {
  const { recipientId } = z.object({ recipientId: id }).strict().parse(req.body);
  await remindSettlementMember(req.params.id, req.userId!, recipientId); res.status(204).end();
});
settlementsRouter.post('/settlement-notices/:id/read', async (req, res) => {
  const result = await prisma.settlementNotice.updateMany({ where: { id: req.params.id, recipientId: req.userId!, batch: { group: { memberships: { some: { userId: req.userId! } } } } }, data: { readAt: new Date() } });
  if (!result.count) {
    const budget = await prisma.budgetNotice.updateMany({ where: { id: req.params.id, recipientId: req.userId!, expense: { paidByUserId: req.userId!, group: { memberships: { some: { userId: req.userId! } } } } }, data: { readAt: new Date() } });
    if (!budget.count) throw new ExpenseError(404, 'Notification not found');
  }
  res.status(204).end();
});

const uniqueBatches = <T extends { batchId: string }>(rows: T[]) => new Set(rows.map(a => a.batchId)).size === rows.length;
settlementsRouter.post('/groups/:id/settlement-payments', async (req, res) => {
  const input = z.object({ recipientId: id, method: z.enum(methods), clientRequestId: z.uuid(), allocations: z.array(z.object({ batchId: id, amountCents: cents }).strict()).min(1).max(500).refine(uniqueBatches) }).strict().parse(req.body);
  res.json(await reportGroupPayment(req.params.id, req.userId!, input));
});
settlementsRouter.post('/groups/:id/settlement-confirmations', async (req, res) => {
  const input = z.object({ senderId: id, status: z.enum(['CONFIRMED', 'ISSUE']), allocations: z.array(z.object({ batchId: id, paymentIds: z.array(id).min(1).max(500).refine(ids => new Set(ids).size === ids.length) }).strict()).min(1).max(500).refine(uniqueBatches) }).strict().parse(req.body);
  res.json(await confirmGroupPayments(req.params.id, req.userId!, input));
});
settlementsRouter.post('/groups/:id/settlement-reminders', async (req, res) => {
  const { recipientId } = z.object({ recipientId: id }).strict().parse(req.body);
  await remindGroupMember(req.params.id, req.userId!, recipientId); res.status(204).end();
});
