import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/requireAuth.js';
import { prisma } from '../../config/database.js';
import { ExpenseError } from '../expenses/expense.service.js';
import { confirmSettlementPayments, initializeSettlement, methods, previewSettlement, remindSettlementMember, reportSettlementPayment, settlementInbox } from './settlement.service.js';
export const settlementsRouter = Router();
settlementsRouter.use(requireAuth);
const id = z.string().min(1).max(100);
const cents = z.number().int().positive().max(2_000_000_000);
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
  if (!result.count) throw new ExpenseError(404, 'Notification not found');
  res.status(204).end();
});
