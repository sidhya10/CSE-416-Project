export type MonthPoint = { label: string; spendingCents: number; incomeCents: number };

// Sample fixture data mirroring the mockup. Not wired to a backend yet —
// mirrors the pattern used by budgets/categoryPlan.ts until F3's real data store exists.
export const MONTHS: MonthPoint[] = [
  { label: 'Jun', spendingCents: 62000, incomeCents: 180000 },
  { label: 'Jul', spendingCents: 54000, incomeCents: 190000 },
  { label: 'Aug', spendingCents: 81000, incomeCents: 185000 },
  { label: 'Sep', spendingCents: 105750, incomeCents: 220000 },
];

export type Todo = { id: string; label: string; trailing: string; interactive: boolean };

export const TODOS: Todo[] = [
  { id: 'bank-charge', label: 'Review 1 matched bank charge', trailing: 'Review ›', interactive: true },
  { id: 'rent', label: 'Apartment rent due in 3 days', trailing: '$1,050', interactive: false },
  { id: 'split', label: 'New expense needs your split', trailing: 'Split ›', interactive: true },
];

export const GROUP_UPDATES_COUNT = 2;
export const GREETING_NAME = 'Vivian';
export const GREETING_MONTH = 'September';
export const SYNCED_LABEL = 'Synced 2 min ago';
export const RECENT_ACTIVITY = 'Nicole confirmed your $38.20 settlement';

export const maxMonthCents = (months: MonthPoint[]) =>
  months.reduce((max, month) => Math.max(max, month.spendingCents, month.incomeCents), 0);

export const barHeightPct = (cents: number, maxCents: number) =>
  maxCents ? Math.min(100, Math.max(0, (cents / maxCents) * 100)) : 0;
