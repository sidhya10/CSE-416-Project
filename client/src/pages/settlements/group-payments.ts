import type { SettlementBatch, SettlementPair } from '../../api/settlements.api';
export type GroupPaymentPair = SettlementPair & { sources: { batchId: string; pair: SettlementPair }[] };
export type GroupPayments = { id: string; groupName: string; expenses: SettlementBatch['expenses']; pairs: GroupPaymentPair[] };
/** Combine open periods for display; original source allocations remain the payment ledger. */
export function groupPayments(batches: SettlementBatch[], retainedBatchIds: string[] = []): GroupPayments[] {
  const groups = new Map<string, GroupPayments>();
  for (const batch of batches.filter(b => !b.completed || retainedBatchIds.includes(b.id))) {
    const group = groups.get(batch.groupId) ?? { id: batch.groupId, groupName: batch.groupName, expenses: [], pairs: [] };
    group.expenses.push(...batch.expenses);
    for (const source of batch.pairs) {
      let pair = group.pairs.find(p => p.senderId === source.senderId && p.recipientId === source.recipientId);
      if (!pair) { pair = { ...source, amountCents: 0, confirmedCents: 0, pendingCents: 0, unreportedCents: 0, pendingPayments: [], sources: [] }; group.pairs.push(pair); }
      pair.amountCents += source.amountCents; pair.confirmedCents += source.confirmedCents;
      pair.pendingCents += source.pendingCents; pair.unreportedCents += source.unreportedCents;
      pair.pendingPayments.push(...source.pendingPayments); pair.sources.push({ batchId: batch.id, pair: source });
    }
    groups.set(group.id, group);
  }
  return [...groups.values()];
}
export const reportAllocations = (pair: GroupPaymentPair) => pair.sources.filter(s => s.pair.unreportedCents > 0).map(s => ({ batchId: s.batchId, amountCents: s.pair.unreportedCents }));
export const confirmAllocations = (pair: GroupPaymentPair) => pair.sources.filter(s => s.pair.pendingPayments.length > 0).map(s => ({ batchId: s.batchId, paymentIds: s.pair.pendingPayments.map(p => p.id) }));
