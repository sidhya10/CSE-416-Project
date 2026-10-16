import type { ApiCategoryTransaction, ApiPersonalBudget, CategoryKey } from '../../api/budgets.api';

export type { CategoryKey };
export type CategoryBudget = { key: CategoryKey; label: string; spentCents: number; plannedCents: number; color: string };

// Labels and chart colors are presentation only; limits and spending come from the budgets API.
export const CATEGORY_META: Record<CategoryKey, { label: string; color: string }> = {
  dining: { label: 'Dining', color: '#e86e57' },
  groceries: { label: 'Groceries', color: '#1f6e52' },
  transit: { label: 'Transit', color: '#4a7fc4' },
  shopping: { label: 'Shopping', color: '#f6bd4d' },
  other: { label: 'Other', color: '#465366' },
};

// Sample fixture used only by the Home dashboard preview (pages/dashboard), which is not wired to the budgets API.
export const CATEGORY_BUDGETS: CategoryBudget[] = [
  { key: 'dining', label: 'Dining', spentCents: 24800, plannedCents: 36500, color: '#e86e57' },
  { key: 'groceries', label: 'Groceries', spentCents: 18600, plannedCents: 35000, color: '#1f6e52' },
  { key: 'transit', label: 'Transit', spentCents: 9200, plannedCents: 20000, color: '#4a7fc4' },
  { key: 'shopping', label: 'Shopping', spentCents: 30100, plannedCents: 32500, color: '#f6bd4d' },
  { key: 'other', label: 'Other', spentCents: 23050, plannedCents: 66000, color: '#465366' },
];

// Mirrors the server's MAX_LIMIT_CENTS ($1,000,000).
export const MAX_LIMIT_CENTS = 100_000_000;

export const toCategoryBudgets = (categories: ApiPersonalBudget['categories']): CategoryBudget[] =>
  categories.map(category => ({ ...category, ...CATEGORY_META[category.key] }));

export const totalSpentCents = (items: CategoryBudget[]) => items.reduce((sum, item) => sum + item.spentCents, 0);
export const totalPlannedCents = (items: CategoryBudget[]) => items.reduce((sum, item) => sum + item.plannedCents, 0);

export const categoryPct = (item: CategoryBudget) =>
  item.plannedCents ? Math.min(100, Math.max(0, (item.spentCents / item.plannedCents) * 100)) : 0;

// A limit of $0 means no limit is set, so such a category is never over budget.
export const isOverLimit = (item: CategoryBudget) => item.plannedCents > 0 && item.spentCents > item.plannedCents;

export type BudgetPeriod = { monthLabel: string; daysLeft: number; daysInMonth: number };

export const budgetPeriod = (data: Pick<ApiPersonalBudget, 'month' | 'daysLeft' | 'daysInMonth'>): BudgetPeriod => ({
  monthLabel: new Date(`${data.month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }),
  daysLeft: data.daysLeft, daysInMonth: data.daysInMonth,
});

export type CategoryTransaction = ApiCategoryTransaction & { dateLabel: string };

export const toCategoryTransactions = (items: ApiCategoryTransaction[]): CategoryTransaction[] =>
  items.map(item => ({ ...item, dateLabel: new Date(`${item.date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) }));

export type CategoryInsight = { item: CategoryBudget; sharePct: number; usedPct: number; projectedCents: number; overPace: boolean };

// Spend share, budget used, and a straight-line month-end projection per category.
export function categoryInsights(items: CategoryBudget[], daysLeft: number, daysInPeriod: number): CategoryInsight[] {
  const total = totalSpentCents(items);
  const elapsed = Math.max(1, daysInPeriod - daysLeft);
  return items.map(item => {
    const projectedCents = Math.round((item.spentCents / elapsed) * daysInPeriod);
    return {
      item,
      sharePct: total ? (item.spentCents / total) * 100 : 0,
      usedPct: item.plannedCents ? (item.spentCents / item.plannedCents) * 100 : 0,
      projectedCents,
      overPace: item.plannedCents > 0 && projectedCents > item.plannedCents,
    };
  });
}
