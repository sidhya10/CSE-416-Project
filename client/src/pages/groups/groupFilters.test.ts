import { describe, expect, it } from 'vitest';
import { defaultFilters, selectGroups } from './groupFilters';
const base = { name: 'Shared home', description: 'Bills', type: 'General', members: ['alex'], balance: 0, createdAt: '2026-01-01', lastAccessedAt: '2026-03-01', lastActivityAt: '2026-04-01' };
const groups = [
  { ...base, id: 'new', name: 'New settled', members: [], lastActivityAt: '2026-10-01', createdAt: '2026-10-01', lastAccessedAt: null },
  { ...base, id: 'net-zero', amountOwesCents: 1000, amountOwedCents: 1000, hasUnresolved: true },
  { ...base, id: 'owing', amountOwesCents: 3000, amountOwedCents: 0, hasUnresolved: true, lastActivityAt: '2026-05-01' },
  { ...base, id: 'archived', archived: true },
];
const selected = (filters: Partial<typeof defaultFilters & { query: string }> = {}, archived = false) => selectGroups(groups, { ...defaultFilters, query: '', ...filters }, archived).map(g => g.id);
describe('group list filtering', () => {
  it('puts unresolved groups first even with zero net balance', () => expect(selected()).toEqual(['owing', 'net-zero', 'new']));
  it.each([
    [{ query: 'HOME' }, ['owing', 'net-zero']], [{ balance: 'owed' }, ['net-zero']], [{ balance: 'owe', minAmount: '20' }, ['owing']],
    [{ friendId: 'alex' }, ['owing', 'net-zero']], [{ friendId: 'missing' }, []], [{ createdAfter: '2026-06-01' }, ['new']],
    [{ createdBefore: '2026-01-01' }, ['owing', 'net-zero']], [{ accessedAfter: '2026-02-01' }, ['owing', 'net-zero']],
    [{ accessedBefore: '2026-01-01' }, []], [{ balance: 'settled' }, ['new']], [{ type: 'Trip' }, []],
    [{ maxAmount: '15' }, ['net-zero', 'new']], [{ sort: 'owed' }, ['net-zero', 'owing', 'new']],
  ])('supports %j', (filters, expected) => expect(selected(filters)).toEqual(expected));
  it('shows archives in a separate list', () => expect(selected({}, true)).toEqual(['archived']));
});
