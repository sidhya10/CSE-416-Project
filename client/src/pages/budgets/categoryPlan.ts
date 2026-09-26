export type CategoryKey = 'dining' | 'groceries' | 'transit' | 'shopping' | 'other';
export type CategoryBudget = { key: CategoryKey; label: string; spentCents: number; plannedCents: number; color: string };

// Sample fixture data mirroring the mockup exactly. Not wired to a backend yet —
// mirrors the pattern used by simulator.ts's CURRENT_LIMITS until F3's real budget store exists.
export const CATEGORY_BUDGETS: CategoryBudget[] = [
  { key: 'dining', label: 'Dining', spentCents: 24800, plannedCents: 36500, color: '#e86e57' },
  { key: 'groceries', label: 'Groceries', spentCents: 18600, plannedCents: 35000, color: '#1f6e52' },
  { key: 'transit', label: 'Transit', spentCents: 9200, plannedCents: 20000, color: '#4a7fc4' },
  { key: 'shopping', label: 'Shopping', spentCents: 30100, plannedCents: 32500, color: '#f6bd4d' },
  { key: 'other', label: 'Other', spentCents: 23050, plannedCents: 66000, color: '#465366' },
];

export const DAYS_LEFT = 12;
export const LAST_SYNCED_LABEL = '2 min ago';

export const totalSpentCents = (items: CategoryBudget[]) => items.reduce((sum, item) => sum + item.spentCents, 0);
export const totalPlannedCents = (items: CategoryBudget[]) => items.reduce((sum, item) => sum + item.plannedCents, 0);

export const categoryPct = (item: CategoryBudget) =>
  item.plannedCents ? Math.min(100, Math.max(0, (item.spentCents / item.plannedCents) * 100)) : 0;
