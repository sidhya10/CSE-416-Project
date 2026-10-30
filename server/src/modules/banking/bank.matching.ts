import type { Prisma } from '@prisma/client';

const DAY = 86_400_000;
const words = (value: string) => new Set(value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(word => word.length > 1));
export const merchantSimilarity = (query: string, candidate: string) => {
  const wanted = words(query), available = words(candidate);
  if (!wanted.size || !available.size) return 0;
  let shared = 0;
  for (const word of wanted) if (available.has(word)) shared++;
  return shared / Math.max(wanted.size, available.size);
};

const dateWindow = (date: Date, days: number) => ({
  gte: new Date(date.getTime() - days * DAY),
  lte: new Date(date.getTime() + days * DAY),
});

/** Conservative automatic match: exact total and one unambiguous nearby posted charge. */
export async function automaticExpenseMatch(tx: Prisma.TransactionClient, userId: string, input: { amountCents: number; date: Date; merchant: string }) {
  const rows = await tx.bankTransaction.findMany({
    where: {
      amountCents: input.amountCents, pending: false, excluded: false, autoExcludedReason: null,
      date: dateWindow(input.date, 3), linkedExpense: null, settlementTransaction: null,
      account: { hidden: false, connection: { userId } },
    },
    select: { id: true, date: true, name: true, merchant: true },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
    take: 10,
  });
  if (rows.length === 1) return rows[0]!.id;
  if (!rows.length) return null;
  const ranked = rows.map(row => ({
    id: row.id,
    sameDay: row.date.getTime() === input.date.getTime(),
    similarity: merchantSimilarity(input.merchant, `${row.merchant ?? ''} ${row.name}`),
  })).sort((a, b) => Number(b.sameDay) - Number(a.sameDay) || b.similarity - a.similarity);
  const best = ranked[0]!, next = ranked[1]!;
  return best.sameDay && !next.sameDay || best.similarity >= 0.6 && best.similarity - next.similarity >= 0.25 ? best.id : null;
}

/** Finds a sender's already-posted Zelle/transfer for a newly reported group repayment. */
export async function automaticSettlementMatch(tx: Prisma.TransactionClient, userId: string, input: { amountCents: number; date: Date; method: string; recipientName: string }) {
  const rows = await tx.bankTransaction.findMany({
    where: {
      amountCents: input.amountCents, pending: false, autoExcludedReason: null,
      date: dateWindow(input.date, 5), linkedExpense: null, settlementTransaction: null,
      account: { hidden: false, connection: { userId } },
      OR: [
        { category: 'TRANSFER_OUT' },
        { name: { contains: 'Zelle', mode: 'insensitive' } },
        { merchant: { contains: 'Zelle', mode: 'insensitive' } },
        { name: { contains: 'transfer', mode: 'insensitive' } },
      ],
    },
    select: { id: true, date: true, name: true, merchant: true },
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
    take: 10,
  });
  if (rows.length === 1) return rows[0]!.id;
  if (!rows.length) return null;
  const hint = `${input.method} ${input.recipientName}`;
  const ranked = rows.map(row => ({ id: row.id, distance: Math.abs(row.date.getTime() - input.date.getTime()), similarity: merchantSimilarity(hint, `${row.merchant ?? ''} ${row.name}`) }))
    .sort((a, b) => b.similarity - a.similarity || a.distance - b.distance);
  return ranked[0]!.similarity >= 0.5 && ranked[0]!.similarity - ranked[1]!.similarity >= 0.2 ? ranked[0]!.id : null;
}
