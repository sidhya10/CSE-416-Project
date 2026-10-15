import { lockMaintenance } from '../../utils/maintenance-lock.js';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { ExpenseError, requireMember, transaction } from '../expenses/expense.service.js';
import { cycleDate } from './schedule.js';
import { planSchema, presentBill, runMaintenance, validatePlan, writeCycleShares } from './recurring.service.js';

export const recurringRouter = Router();
recurringRouter.use(requireAuth);
const input = z.object({
  title: z.string().trim().min(1).max(200), amountCents: z.number().int().positive().max(100_000_000),
  startDate: z.iso.date().refine(date => date >= '2000-01-01' && date <= '2100-12-31', 'Choose a date from 2000 through 2100'),
  frequency: z.enum(['Weekly', 'Monthly', 'Quarterly', 'Semi-yearly', 'Yearly', 'Custom']),
  customEvery: z.number().int().min(1).max(1000).default(1), customUnit: z.enum(['days', 'weeks', 'months', 'years']).default('months'),
  defaultPlan: planSchema,
}).strict();
recurringRouter.get('/groups/:groupId/recurring', async (req, res) => {
  await requireMember(prisma, req.params.groupId, req.userId!);
  res.json({ bills: (await prisma.recurringBill.findMany({ where: { groupId: req.params.groupId }, include: { cycles: true }, orderBy: { createdAt: 'asc' } })).map(presentBill) });
});
recurringRouter.post('/groups/:groupId/recurring', async (req, res) => {
  const value = input.parse(req.body);
  const bill = await transaction(async tx => {
    await lockMaintenance(tx);
    await requireMember(tx, req.params.groupId, req.userId!);
    const group = await tx.group.findUniqueOrThrow({ where: { id: req.params.groupId } });
    if (group.archivedAt) throw new ExpenseError(409, 'Restore the group before adding a schedule');
    if (group.type !== 'Recurring') throw new ExpenseError(400, 'Schedules require a Recurring group');
    await validatePlan(tx, group.id, value.amountCents, value.defaultPlan);
    const intervalEvery = value.frequency === 'Custom' ? value.customEvery : value.frequency === 'Quarterly' ? 3 : value.frequency === 'Semi-yearly' ? 6 : 1;
    const intervalUnit = value.frequency === 'Custom' ? value.customUnit : value.frequency === 'Weekly' ? 'weeks' : value.frequency === 'Yearly' ? 'years' : 'months';
    const created = await tx.recurringBill.create({ data: { groupId: group.id, createdById: req.userId!, title: value.title, amountCents: value.amountCents,
      startDate: new Date(value.startDate), frequency: value.frequency, intervalEvery, intervalUnit, defaultPlan: value.defaultPlan }, include: { cycles: true } });
    await tx.group.update({ where: { id: group.id }, data: { lastActivityAt: new Date() } });
    return created;
  });
  await runMaintenance();
  res.status(201).json({ bill: presentBill(bill) });
});
recurringRouter.patch('/recurring/:id', async (req, res) => {
  const value = z.object({ defaultPlan: planSchema.optional(), paused: z.boolean().optional() }).strict().parse(req.body);
  const bill = await transaction(async tx => {
    await lockMaintenance(tx);
    const bill = await tx.recurringBill.findUnique({ where: { id: req.params.id } });
    if (!bill) throw new ExpenseError(404, 'Schedule not found');
    await requireMember(tx, bill.groupId, req.userId!);
    await validatePlan(tx, bill.groupId, bill.amountCents, value.defaultPlan ?? bill.defaultPlan);
    const updated = await tx.recurringBill.update({ where: { id: bill.id }, data: { ...value, error: null }, include: { cycles: true } });
    await tx.group.update({ where: { id: bill.groupId }, data: { lastActivityAt: new Date() } });
    return updated;
  });
  await runMaintenance(); res.json({ bill: presentBill(bill) });
});
recurringRouter.put('/recurring/:id/cycles/:index', async (req, res) => {
  const index = z.coerce.number().int().min(0).max(100_000).parse(req.params.index);
  const plan = planSchema.parse(req.body);
  await transaction(async tx => {
    await lockMaintenance(tx);
    const bill = await tx.recurringBill.findUnique({ where: { id: req.params.id } });
    if (!bill) throw new ExpenseError(404, 'Schedule not found');
    await requireMember(tx, bill.groupId, req.userId!);
    await validatePlan(tx, bill.groupId, bill.amountCents, plan);
    const date = cycleDate(bill.startDate, bill.intervalEvery, bill.intervalUnit, index);
    if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() > 9999) throw new ExpenseError(400, 'Cycle date is outside the supported range');
    const expense = await tx.expense.findUnique({ where: { recurringBillId_cycleDate: { recurringBillId: bill.id, cycleDate: date } }, include: { shares: { include: { payments: true } } } });
    if (expense) {
      if (expense.shares.some(share => share.payments.length)) throw new ExpenseError(409, 'This cycle has payment history and cannot be changed');
      await writeCycleShares(tx, expense.id, plan);
      await tx.expense.update({ where: { id: expense.id }, data: { paidByUserId: plan.payerId, version: { increment: 1 } } });
    }
    await tx.recurringCycle.upsert({ where: { billId_index: { billId: bill.id, index } }, create: { billId: bill.id, index, plan }, update: { plan } });
    await tx.group.update({ where: { id: bill.groupId }, data: { lastActivityAt: new Date() } });
  });
  res.status(204).end();
});
