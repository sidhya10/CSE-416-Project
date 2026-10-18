import { lockMaintenance } from '../../utils/maintenance-lock.js';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { ExpenseError, type Transaction } from '../expenses/expense.service.js';
import { cycleDate } from './schedule.js';

export const planSchema = z.object({ payerId: z.string().min(1), shares: z.record(z.string(), z.number().int().min(0).max(100_000_000)) }).strict();
export type Plan = z.infer<typeof planSchema>;
export async function validatePlan(tx: Transaction, groupId: string, amount: number, raw: unknown): Promise<Plan> {
  const plan = planSchema.parse(raw);
  const ids = Object.keys(plan.shares);
  if (!ids.length || !ids.includes(plan.payerId) || Object.values(plan.shares).reduce((a, b) => a + b, 0) !== amount) throw new ExpenseError(400, 'Shares must equal the bill total and include the payer');
  const count = await tx.groupMembership.count({ where: { groupId, userId: { in: ids } } });
  if (count !== ids.length) throw new ExpenseError(400, 'Every payer and participant must still belong to the group');
  return plan;
}
export async function writeCycleShares(tx: Transaction, expenseId: string, plan: Plan) {
  await tx.expenseShare.deleteMany({ where: { expenseId } });
  await tx.expenseShare.createMany({ data: Object.entries(plan.shares).map(([userId, totalCents], position) => ({ expenseId, userId, totalCents, baseCents: totalCents, position })) });
}
// One database lock coordinates scheduler instances and requests. The unique cycle key
// is a second guard against duplicates. A failed transaction never advances a schedule.
export async function runMaintenance(now = new Date(), groupId: string | null = null) {
  return prisma.$transaction(async tx => {
    await lockMaintenance(tx);
    // Archive before generating: a dormant schedule cannot keep an inactive group alive.
    await tx.$executeRaw`UPDATE "Group" SET "archivedAt" = (${now}::timestamptz AT TIME ZONE 'UTC'), "archiveReason" = 'INACTIVE' WHERE (${groupId}::text IS NULL OR "id" = ${groupId}) AND "archivedAt" IS NULL AND "lastActivityAt" <= (${now}::timestamptz AT TIME ZONE 'UTC') - "inactivityDays" * INTERVAL '1 day'
      AND NOT EXISTS (SELECT 1 FROM "Expense" e JOIN "ExpenseShare" s ON s."expenseId" = e.id
        WHERE e."groupId" = "Group".id AND s."userId" <> e."paidByUserId"
        AND s."totalCents" > COALESCE((SELECT SUM(p."amountCents") FROM "ExpensePayment" p
          WHERE p."expenseId" = s."expenseId" AND p."senderUserId" = s."userId" AND p.status = 'CONFIRMED'), 0))`;
    const bills = await tx.recurringBill.findMany({ where: { ...(groupId ? { groupId } : {}), paused: false, group: { archivedAt: null } }, include: { cycles: true }, orderBy: { id: 'asc' } });
    let budget = 500;
    for (const bill of bills) {
      let index = bill.nextCycle;
      while (budget > 0) {
        const date = cycleDate(bill.startDate, bill.intervalEvery, bill.intervalUnit, index);
        if (date > now) break;
        let plan: Plan;
        try { plan = await validatePlan(tx, bill.groupId, bill.amountCents, bill.cycles.find(cycle => cycle.index === index)?.plan ?? bill.defaultPlan); }
        catch (error) {
          if (!(error instanceof ExpenseError) && !(error instanceof z.ZodError)) throw error;
          await tx.recurringBill.update({ where: { id: bill.id }, data: { paused: true, error: 'Update the default payer and shares to match current group members, then save the updated plan.' } });
          break;
        }
        const existing = await tx.expense.findUnique({ where: { recurringBillId_cycleDate: { recurringBillId: bill.id, cycleDate: date } } });
        if (!existing) {
          const expense = await tx.expense.create({ data: {
            groupId: bill.groupId, createdByUserId: bill.createdById, paidByUserId: plan.payerId,
            clientRequestId: `recurring:${bill.id}:${index}`, recurringBillId: bill.id, cycleDate: date,
            title: bill.title, expenseDate: date, totalCents: bill.amountCents, splitMode: 'CUSTOM',
            items: { create: { name: bill.title, unitPriceCents: bill.amountCents, quantity: 1, position: 0 } },
          } });
          await writeCycleShares(tx, expense.id, plan);
        }
        await tx.recurringCycle.upsert({ where: { billId_index: { billId: bill.id, index } }, create: { billId: bill.id, index, plan }, update: {} });
        index++; budget--;
        await tx.recurringBill.update({ where: { id: bill.id }, data: { nextCycle: index } });
      }
      if (!budget) break;
    }
  }, { timeout: 30_000 });
}
export function presentBill(bill: Prisma.RecurringBillGetPayload<{ include: { cycles: true } }>) {
  return { ...bill, startDate: bill.startDate.toISOString().slice(0, 10), nextDate: cycleDate(bill.startDate, bill.intervalEvery, bill.intervalUnit, bill.nextCycle).toISOString().slice(0, 10) };
}
