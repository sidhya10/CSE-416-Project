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

export type CategoryTransaction = { id: string; merchant: string; dateLabel: string; amountCents: number; note?: string };

// Sample fixtures; each category's transactions sum exactly to its spentCents above.
export const CATEGORY_TRANSACTIONS: Record<CategoryKey, CategoryTransaction[]> = {
  dining: [
    { id: 'd1', merchant: 'Thai Basil', dateLabel: 'Sep 28', amountCents: 4250 },
    { id: 'd2', merchant: 'Blue Bottle Coffee', dateLabel: 'Sep 25', amountCents: 650 },
    { id: 'd3', merchant: 'Shake Shack', dateLabel: 'Sep 22', amountCents: 1840 },
    { id: 'd4', merchant: 'Group dinner', dateLabel: 'Sep 19', amountCents: 6200, note: 'Your share of a $37.20 group bill' },
    { id: 'd5', merchant: 'Chipotle', dateLabel: 'Sep 15', amountCents: 1425 },
    { id: 'd6', merchant: 'Sushi Zen', dateLabel: 'Sep 11', amountCents: 5985 },
    { id: 'd7', merchant: 'Sunday brunch', dateLabel: 'Sep 5', amountCents: 4450 },
  ],
  groceries: [
    { id: 'g1', merchant: "Trader Joe's", dateLabel: 'Sep 27', amountCents: 5420 },
    { id: 'g2', merchant: 'Whole Foods', dateLabel: 'Sep 20', amountCents: 6830 },
    { id: 'g3', merchant: 'Safeway', dateLabel: 'Sep 13', amountCents: 3150 },
    { id: 'g4', merchant: 'Farmers market', dateLabel: 'Sep 7', amountCents: 3200 },
  ],
  transit: [
    { id: 't1', merchant: 'Clipper reload', dateLabel: 'Sep 24', amountCents: 4000 },
    { id: 't2', merchant: 'Uber', dateLabel: 'Sep 17', amountCents: 1850 },
    { id: 't3', merchant: 'Lyft', dateLabel: 'Sep 9', amountCents: 1350 },
    { id: 't4', merchant: 'Clipper reload', dateLabel: 'Sep 3', amountCents: 2000 },
  ],
  shopping: [
    { id: 's1', merchant: 'Amazon', dateLabel: 'Sep 26', amountCents: 8499 },
    { id: 's2', merchant: 'Target', dateLabel: 'Sep 18', amountCents: 6450 },
    { id: 's3', merchant: 'Uniqlo', dateLabel: 'Sep 12', amountCents: 9051 },
    { id: 's4', merchant: 'Campus bookstore', dateLabel: 'Sep 2', amountCents: 6100 },
  ],
  other: [
    { id: 'o1', merchant: 'Phone bill', dateLabel: 'Sep 26', amountCents: 6500 },
    { id: 'o2', merchant: 'Gym membership', dateLabel: 'Sep 21', amountCents: 4500 },
    { id: 'o3', merchant: 'Spotify + Netflix', dateLabel: 'Sep 14', amountCents: 2598 },
    { id: 'o4', merchant: 'Pharmacy', dateLabel: 'Sep 8', amountCents: 1852 },
    { id: 'o5', merchant: 'Movie night & bowling', dateLabel: 'Sep 6', amountCents: 7600 },
  ],
};

export const DAYS_IN_PERIOD = 30;

export type CategoryInsight = { item: CategoryBudget; sharePct: number; usedPct: number; projectedCents: number; overPace: boolean };

// Spend share, budget used, and a straight-line month-end projection per category.
export function categoryInsights(items: CategoryBudget[], daysLeft = DAYS_LEFT, daysInPeriod = DAYS_IN_PERIOD): CategoryInsight[] {
  const total = totalSpentCents(items);
  const elapsed = Math.max(1, daysInPeriod - daysLeft);
  return items.map(item => {
    const projectedCents = Math.round((item.spentCents / elapsed) * daysInPeriod);
    return {
      item,
      sharePct: total ? (item.spentCents / total) * 100 : 0,
      usedPct: item.plannedCents ? (item.spentCents / item.plannedCents) * 100 : 0,
      projectedCents,
      overPace: projectedCents > item.plannedCents,
    };
  });
}
