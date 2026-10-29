import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { automaticExpenseMatch, automaticSettlementMatch } from '../src/modules/banking/bank.matching.js';

const txWith = (rows: unknown[]) => ({
  bankTransaction: { findMany: vi.fn().mockResolvedValue(rows) },
}) as unknown as Prisma.TransactionClient;

describe('automatic bank matching', () => {
  it('accepts one exact nearby payer charge', async () => {
    const tx = txWith([{ id: 'charge-1', date: new Date('2026-10-10T00:00:00Z'), name: 'CAFE', merchant: 'Corner Cafe' }]);
    await expect(automaticExpenseMatch(tx, 'user-1', { amountCents: 2450, date: new Date('2026-10-10T00:00:00Z'), merchant: 'Corner Cafe' })).resolves.toBe('charge-1');
  });

  it('leaves ambiguous payer charges for manual search', async () => {
    const tx = txWith([
      { id: 'charge-1', date: new Date('2026-10-10T00:00:00Z'), name: 'MARKET', merchant: 'Market' },
      { id: 'charge-2', date: new Date('2026-10-10T00:00:00Z'), name: 'MARKET', merchant: 'Market' },
    ]);
    await expect(automaticExpenseMatch(tx, 'user-1', { amountCents: 2450, date: new Date('2026-10-10T00:00:00Z'), merchant: 'Market' })).resolves.toBeNull();
  });

  it('uses a clear Zelle recipient match for a debtor repayment', async () => {
    const tx = txWith([
      { id: 'zelle-alex', date: new Date('2026-10-10T00:00:00Z'), name: 'Zelle to Alex Smith', merchant: null },
      { id: 'other-transfer', date: new Date('2026-10-09T00:00:00Z'), name: 'Transfer to savings', merchant: null },
    ]);
    await expect(automaticSettlementMatch(tx, 'user-1', { amountCents: 3000, date: new Date('2026-10-10T00:00:00Z'), method: 'Zelle', recipientName: 'Alex Smith' })).resolves.toBe('zelle-alex');
  });
});
