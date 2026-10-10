import { describe, expect, it } from 'vitest';
import { calculateExpense, expenseInput } from '../src/modules/expenses/expense.validation.js';
import { calculateSplit } from '../../client/src/pages/expenses/split';

describe('server split calculations match the existing preview', () => {
  for (const mode of ['EQUAL', 'ITEMS'] as const) it(`conserves cents for ${mode} including quantities and uneven rounding`, () => {
    for (let count = 2; count <= 8; count++) {
      const participantIds = Array.from({ length: count }, (_, index) => `user-${index}`);
      for (let price = 1; price <= 31; price++) {
        const input = expenseInput.parse({ title: 'Food', expenseDate: '2026-10-09', paidByUserId: participantIds[0], splitMode: mode, participantIds,
          items: [{ name: 'Shared', unitPriceCents: price, quantity: 3, assignedUserIds: mode === 'ITEMS' ? participantIds : [] },
            { name: 'Personal', unitPriceCents: 37, quantity: 2, assignedUserIds: mode === 'ITEMS' ? [participantIds[1]] : [] }], taxCents: 11, tipCents: 17, otherCents: 1 });
        const calculated = calculateExpense(input);
        const preview = calculateSplit(input.items.map((item, id) => ({ id, name: item.name, cents: item.unitPriceCents * item.quantity })), 29,
          participantIds.map(id => ({ id, name: id })), participantIds[0]!, mode === 'EQUAL' ? 'equal' : 'items', { 0: participantIds, 1: [participantIds[1]!] });
        expect(calculated.totalCents).toBe(preview.totalCents);
        expect(calculated.shares.map(share => share.totalCents)).toEqual(preview.shares.map(share => share.totalCents));
        expect(calculated.shares.reduce((sum, share) => sum + share.totalCents, 0)).toBe(calculated.totalCents);
      }
    }
  });
});
