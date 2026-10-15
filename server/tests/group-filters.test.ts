import { describe, expect, it } from 'vitest';
import { filterGroups, groupFilters } from '../src/modules/groups/group-list.js';
const base = { description: 'shared expenses', type: 'General', archivedAt: null, createdAt: '2026-01-01T00:00:00Z', lastAccessedAt: '2026-03-01T00:00:00Z', lastActivityAt: '2026-04-01T00:00:00Z', amountOwesCents: 0, amountOwedCents: 0, hasUnresolved: false, members: [{ id: 'friend' }] };
const rows = [
  { ...base, id: 'settled', name: 'New group', createdAt: '2026-10-01', lastActivityAt: '2026-10-01', lastAccessedAt: null, members: [] },
  { ...base, id: 'owe', name: 'Apartment', amountOwesCents: 1200, hasUnresolved: true },
  { ...base, id: 'owed', name: 'Trip', amountOwedCents: 5000, hasUnresolved: true, type: 'Trip', lastActivityAt: '2026-05-01' },
  { ...base, id: 'archived', name: 'Old', archivedAt: '2026-06-01' },
];
const select = (query: object) => filterGroups(rows, groupFilters.parse(query)).map(g => g.id);
describe('group filters and unresolved priority', () => {
  it('keeps unresolved first and sorts by activity', () => expect(select({ archived: 'active' })).toEqual(['owed', 'owe', 'settled']));
  it.each([
    [{ query: 'APART' }, ['owe']], [{ friendId: 'friend', archived: 'active' }, ['owed', 'owe']],
    [{ type: 'Trip' }, ['owed']], [{ balance: 'owe' }, ['owe']], [{ balance: 'owed' }, ['owed']],
    [{ balance: 'settled', archived: 'active' }, ['settled']], [{ balance: 'unresolved' }, ['owed', 'owe']],
    [{ archived: 'archived' }, ['archived']], [{ createdAfter: '2026-06-01' }, ['settled']],
    [{ createdBefore: '2026-01-01', archived: 'active' }, ['owed', 'owe']],
    [{ accessedAfter: '2026-02-01', archived: 'active' }, ['owed', 'owe']],
    [{ accessedBefore: '2026-02-01' }, []], [{ minAmount: 20, maxAmount: 60 }, ['owed']],
    [{ query: 'trip', friendId: 'friend', balance: 'owed', minAmount: 40 }, ['owed']],
  ])('supports %j', (query, expected) => expect(select(query)).toEqual(expected));
  it('supports creation, access and both amount sort directions while retaining priority', () => {
    const values = [{ ...rows[1]!, id: 'one', createdAt: '2026-02-01', lastAccessedAt: '2026-05-01', amountOwesCents: 100 }, { ...rows[2]!, id: 'two', createdAt: '2026-01-01', lastAccessedAt: '2026-03-01', amountOwesCents: 500 }];
    for (const [sort, expected] of [['created', ['one', 'two']], ['accessed', ['one', 'two']], ['owe', ['two', 'one']], ['owed', ['two', 'one']]] as const) expect(filterGroups(values, groupFilters.parse({ sort })).map(g => g.id)).toEqual(expected);
  });
});
