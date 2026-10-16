import type { ApiGroupBudget, ApiHomeSummary } from '../../api/budgets.api';
import { isOverLimit, type CategoryBudget } from '../budgets/categoryPlan';
import { formatCents } from '../expenses/split';

export type MonthPoint = { label: string; spendingCents: number; incomeCents: number };

export const toMonthPoints = (history: ApiHomeSummary['history']): MonthPoint[] =>
  history.map(item => ({
    label: new Date(`${item.month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }),
    spendingCents: item.spendingCents, incomeCents: item.incomeCents,
  }));

export const maxMonthCents = (months: MonthPoint[]) =>
  months.reduce((max, month) => Math.max(max, month.spendingCents, month.incomeCents), 0);

export const barHeightPct = (cents: number, maxCents: number) =>
  maxCents ? Math.min(100, Math.max(0, (cents / maxCents) * 100)) : 0;

export const greetingFor = (hour: number) => hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'there';

export type TodoTarget = 'Budget' | 'Groups';
export type Todo = { id: string; label: string; trailing: string; target: TodoTarget };

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

// Things that need the user's attention, from group balances, payments waiting on them, and categories over their limit.
export function buildTodos(groups: ApiGroupBudget[], home: ApiHomeSummary | null, budgets: CategoryBudget[]): Todo[] {
  const todos: Todo[] = [];
  if (home && home.pendingPayments.count > 0) {
    todos.push({ id: 'confirm', label: `Confirm ${plural(home.pendingPayments.count, 'payment')} sent to you (${formatCents(home.pendingPayments.cents)})`, trailing: 'Review ›', target: 'Groups' });
  }
  const mine = groups.flatMap(group => group.members.filter(member => member.isYou));
  const owes = mine.filter(member => member.owesCents > 0), owed = mine.filter(member => member.owedCents > 0);
  if (owes.length) todos.push({ id: 'owe', label: `You owe ${formatCents(owes.reduce((sum, m) => sum + m.owesCents, 0))} in ${plural(owes.length, 'group')}`, trailing: 'Settle ›', target: 'Groups' });
  if (owed.length) todos.push({ id: 'owed', label: `You're owed ${formatCents(owed.reduce((sum, m) => sum + m.owedCents, 0))} in ${plural(owed.length, 'group')}`, trailing: 'View ›', target: 'Groups' });
  const over = budgets.filter(isOverLimit);
  if (over.length) todos.push({ id: 'over', label: `Over budget: ${over.map(item => item.label).join(', ')}`, trailing: 'View ›', target: 'Budget' });
  return todos;
}
