import type { Prisma } from '@prisma/client';

type LedgerExpense = { paidByUserId: string; shares: { userId: string; totalCents: number; payments: { status: string; amountCents: number }[] }[] };
export const hasOpenSplits = (expenses: LedgerExpense[]) => expenses.some(expense => expense.shares.some(share =>
  share.userId !== expense.paidByUserId && share.totalCents > share.payments.filter(payment => payment.status === 'CONFIRMED').reduce((sum, payment) => sum + payment.amountCents, 0)));

export async function groupHasOpenSplits(tx: Prisma.TransactionClient, groupId: string) {
  return hasOpenSplits(await tx.expense.findMany({ where: { groupId }, include: { shares: { include: { payments: true } } } }));
}
