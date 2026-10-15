export const defaultFilters = { sort: 'activity', balance: 'all', friendId: '', type: '', createdAfter: '', createdBefore: '', accessedAfter: '', accessedBefore: '', minAmount: '', maxAmount: '' };
type Filters = typeof defaultFilters & { query: string };
type GroupRow = { id: number | string; name: string; description: string; type: string; members: string[]; archived?: boolean; createdAt?: string; lastActivityAt?: string; lastAccessedAt?: string | null; balance: number; amountOwedCents?: number; amountOwesCents?: number; hasUnresolved?: boolean };
export function selectGroups<T extends GroupRow>(groups: T[], filters: Filters, archived: boolean) {
  const owes = (g: T) => g.amountOwesCents ?? Math.max(0, -g.balance * 100);
  const owed = (g: T) => g.amountOwedCents ?? Math.max(0, g.balance * 100);
  const unresolved = (g: T) => g.hasUnresolved ?? (owes(g) > 0 || owed(g) > 0);
  const range = (date: string | null | undefined, after: string, before: string) => (!after || !!date && date.slice(0, 10) >= after) && (!before || !!date && date.slice(0, 10) <= before);
  const score = (g: T) => filters.sort === 'owe' ? owes(g) : filters.sort === 'owed' ? owed(g) : Date.parse((filters.sort === 'created' ? g.createdAt : filters.sort === 'accessed' ? g.lastAccessedAt : g.lastActivityAt) ?? '1970-01-01');
  return groups.filter(g => {
    const amount = (filters.balance === 'owe' || filters.sort === 'owe' ? owes(g) : filters.balance === 'owed' || filters.sort === 'owed' ? owed(g) : Math.max(owes(g), owed(g))) / 100;
    return !!g.archived === archived && `${g.name} ${g.description}`.toLowerCase().includes(filters.query.trim().toLowerCase()) &&
      (!filters.friendId || g.members.includes(filters.friendId)) && (!filters.type || g.type === filters.type) &&
      (filters.balance === 'all' || filters.balance === 'owe' && owes(g) > 0 || filters.balance === 'owed' && owed(g) > 0 || filters.balance === 'unresolved' && unresolved(g) || filters.balance === 'settled' && !unresolved(g)) &&
      range(g.createdAt, filters.createdAfter, filters.createdBefore) && range(g.lastAccessedAt, filters.accessedAfter, filters.accessedBefore) &&
      (filters.minAmount === '' || amount >= Number(filters.minAmount)) && (filters.maxAmount === '' || amount <= Number(filters.maxAmount));
  }).sort((a, b) => Number(unresolved(b)) - Number(unresolved(a)) || score(b) - score(a) || String(a.id).localeCompare(String(b.id)));
}
