import { z } from 'zod';
export const groupFilters = z.object({
  query: z.string().max(200).default(''), archived: z.enum(['active', 'archived', 'all']).default('all'),
  friendId: z.string().optional(), type: z.enum(['General', 'Trip', 'Recurring']).optional(),
  balance: z.enum(['all', 'owe', 'owed', 'unresolved', 'settled']).default('all'),
  sort: z.enum(['activity', 'created', 'accessed', 'owe', 'owed']).default('activity'),
  createdAfter: z.iso.date().optional(), createdBefore: z.iso.date().optional(),
  accessedAfter: z.iso.date().optional(), accessedBefore: z.iso.date().optional(),
  minAmount: z.coerce.number().min(0).optional(), maxAmount: z.coerce.number().min(0).optional(),
});
export type GroupFilters = z.infer<typeof groupFilters>;
type ListGroup = { id: string; name: string; description: string; type: string; archivedAt: string | null; createdAt: string; lastActivityAt: string; lastAccessedAt: string | null; amountOwedCents: number; amountOwesCents: number; hasUnresolved: boolean; members: { id: string }[] };
export function filterGroups<T extends ListGroup>(groups: T[], filters: GroupFilters) {
  const dateRange = (value: string | null, after?: string, before?: string) => (!after || !!value && value.slice(0, 10) >= after) && (!before || !!value && value.slice(0, 10) <= before);
  const rows = groups.filter(group => {
    const amount = (filters.balance === 'owe' || filters.sort === 'owe' ? group.amountOwesCents : filters.balance === 'owed' || filters.sort === 'owed' ? group.amountOwedCents : Math.max(group.amountOwedCents, group.amountOwesCents)) / 100;
    return `${group.name} ${group.description}`.toLowerCase().includes(filters.query.trim().toLowerCase()) &&
      (filters.archived === 'all' || (filters.archived === 'archived') === !!group.archivedAt) &&
      (!filters.friendId || group.members.some(member => member.id === filters.friendId)) && (!filters.type || group.type === filters.type) &&
      (filters.balance === 'all' || filters.balance === 'owe' && group.amountOwesCents > 0 || filters.balance === 'owed' && group.amountOwedCents > 0 || filters.balance === 'unresolved' && group.hasUnresolved || filters.balance === 'settled' && !group.hasUnresolved) &&
      dateRange(group.createdAt, filters.createdAfter, filters.createdBefore) && dateRange(group.lastAccessedAt, filters.accessedAfter, filters.accessedBefore) &&
      (filters.minAmount === undefined || amount >= filters.minAmount) && (filters.maxAmount === undefined || amount <= filters.maxAmount);
  });
  const score = (group: T) => filters.sort === 'owe' ? group.amountOwesCents : filters.sort === 'owed' ? group.amountOwedCents : Date.parse(filters.sort === 'created' ? group.createdAt : filters.sort === 'accessed' ? group.lastAccessedAt ?? '1970-01-01' : group.lastActivityAt);
  return rows.sort((a, b) => Number(b.hasUnresolved) - Number(a.hasUnresolved) || score(b) - score(a) || b.lastActivityAt.localeCompare(a.lastActivityAt) || a.id.localeCompare(b.id));
}
