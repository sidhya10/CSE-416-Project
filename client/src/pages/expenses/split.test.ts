import { describe, expect, it } from 'vitest';
import { calculateSplit } from './split';
const members = ['you', 'nicole', 'eva', 'sidhya'].map(id => ({ id, name: id }));
const items = [{ id: 0, name: 'Pad Thai', cents: 1850 }, { id: 1, name: 'Green Curry', cents: 2200 }, { id: 2, name: 'Spring Rolls', cents: 1200 }];

describe('split calculations', () => {
  it('conserves cents in equal splits and excludes the payer from reimbursements', () => {
    const result = calculateSplit(items, 2500, members, 'nicole', 'equal', {});
    expect(result.shares.map(share => share.totalCents)).toEqual([1938, 1938, 1937, 1937]);
    expect(result.shares.map(share => share.reimbursementCents)).toEqual([1938, 0, 1937, 1937]);
    expect(result.valid).toBe(true);
  });
  it('matches the item design with proportional fees and deterministic penny rounding', () => {
    const result = calculateSplit(items, 2500, members, 'nicole', 'items', { 0: ['you', 'nicole'], 1: ['nicole', 'eva', 'sidhya'], 2: members.map(member => member.id) });
    expect(result.shares.map(share => share.baseCents)).toEqual([1225, 1959, 1033, 1033]);
    expect(result.shares.map(share => share.totalCents)).toEqual([1808, 2892, 1525, 1525]);
    expect(result.shares.reduce((sum, share) => sum + share.totalCents, 0)).toBe(7750);
  });
  it('blocks unassigned items and charges no fees to members with no assigned items', () => {
    expect(calculateSplit(items, 2500, members, 'nicole', 'items', {}).valid).toBe(false);
    const result = calculateSplit(items, 2500, members, 'nicole', 'items', { 0: ['you'], 1: ['you'], 2: ['you'] });
    expect(result.shares.map(share => share.totalCents)).toEqual([7750, 0, 0, 0]);
  });
  it('conserves totals for tiny amounts, uneven groups, and large fee products', () => {
    for (const count of [1, 3, 7]) for (const amount of [1, 2, 101, 999999999]) for (const fee of [0, 1, 999999999]) {
      const group = members.slice(0, 1).concat(Array.from({ length: count - 1 }, (_, index) => ({ id: String(index), name: String(index) })));
      const result = calculateSplit([{ id: 0, name: 'Item', cents: amount }], fee, group, 'you', 'items', { 0: group.map(member => member.id) });
      expect(result.shares.reduce((sum, share) => sum + share.totalCents, 0)).toBe(amount + fee);
      expect(result.shares.every(share => Number.isInteger(share.totalCents) && share.totalCents >= 0)).toBe(true);
    }
  });
});
