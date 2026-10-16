import type { ApiPersonalBudget, CategoryKey } from '../../api/budgets.api';
import { relativeTime } from '../../utils/dates';
import { formatCents } from '../expenses/split';
import { CATEGORY_META, budgetPeriod } from './categoryPlan';

export { relativeTime };
export type { CategoryKey };

export type CategoryLimits = Partial<Record<CategoryKey, number>>;
export type Scenario = { id: string; name: string; limits: CategoryLimits; savedAt: number };

export type SimCategory = { key: CategoryKey; label: string; icon: string; spentCents: number; limitCents: number };
export type SimModel = { categories: SimCategory[]; daysLeft: number; daysInMonth: number; monthLabel: string };

const ICONS: Record<CategoryKey, string> = { dining: '🍴', groceries: '🛒', transit: '🚌', shopping: '🛍️', other: '📦' };

export const SLIDER_STEP_CENTS = 500;
export const MAX_SAVED_SCENARIOS = 8;
export const MAX_COMPARE_SELECTION = 2;

// Only categories with a limit can be simulated: a limit of $0 means "no limit set" in the budgets API.
export const toSimModel = (data: ApiPersonalBudget): SimModel => ({
  categories: data.categories.filter(category => category.plannedCents > 0).map(category => ({
    key: category.key, label: CATEGORY_META[category.key].label, icon: ICONS[category.key],
    spentCents: category.spentCents, limitCents: category.plannedCents,
  })),
  ...budgetPeriod(data),
});

export const limitFor = (category: SimCategory, limits: CategoryLimits) => limits[category.key] ?? category.limitCents;
export const limitsOf = (model: SimModel): CategoryLimits => Object.fromEntries(model.categories.map(category => [category.key, category.limitCents]));
export const totalPlanCents = (model: SimModel) => model.categories.reduce((sum, category) => sum + category.limitCents, 0);

// Deterministic, pure projection. Straight-line pace matches the Budget tab's insights, so both screens
// agree: spending so far continues at the same daily rate to the end of the month.
export const paceCents = (category: SimCategory, model: SimModel) => {
  const elapsed = Math.max(1, model.daysInMonth - model.daysLeft);
  return Math.round((category.spentCents / elapsed) * model.daysInMonth);
};

// Spending that is already done cannot be undone, and a limit only caps spending the user would
// otherwise do; raising a limit never assumes extra spending.
export const projectedSpendCents = (category: SimCategory, model: SimModel, limitCents: number) =>
  Math.max(category.spentCents, Math.min(paceCents(category, model), limitCents));

// What would remain of today's plan at month end if the user holds to the scenario's limits.
export const projectedLeftCents = (model: SimModel, limits: CategoryLimits) =>
  model.categories.reduce((sum, category) => sum + category.limitCents - projectedSpendCents(category, model, limitFor(category, limits)), 0);

export const baselineLeftCents = (model: SimModel) => projectedLeftCents(model, {});
export const scenarioDeltaCents = (model: SimModel, limits: CategoryLimits) => projectedLeftCents(model, limits) - baselineLeftCents(model);

export const changedCategories = (model: SimModel, limits: CategoryLimits) =>
  model.categories.filter(category => limitFor(category, limits) !== category.limitCents);

export type ResultStatus = 'on-track' | 'needs-cuts' | 'over-limit';
export type CategoryResult = {
  category: SimCategory;
  limitCents: number;
  changed: boolean;
  paceCents: number;
  projectedCents: number;
  savedCents: number;
  status: ResultStatus;
  dailyAllowanceCents: number | null;
};

export function categoryResults(model: SimModel, limits: CategoryLimits): CategoryResult[] {
  return model.categories.map(category => {
    const limitCents = limitFor(category, limits);
    const pace = paceCents(category, model);
    const projectedCents = projectedSpendCents(category, model, limitCents);
    const status: ResultStatus = category.spentCents > limitCents ? 'over-limit' : pace > limitCents ? 'needs-cuts' : 'on-track';
    return {
      category, limitCents, changed: limitCents !== category.limitCents, paceCents: pace, projectedCents,
      savedCents: projectedSpendCents(category, model, category.limitCents) - projectedCents,
      status,
      // With days left, a category that is on pace to exceed its limit needs a daily cap to stay inside it.
      dailyAllowanceCents: status === 'needs-cuts' && model.daysLeft > 0 ? Math.floor((limitCents - category.spentCents) / model.daysLeft) : null,
    };
  });
}

const listNames = (names: string[]) => names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

// A plain-language description of the computed result. It restates figures already computed above
// and introduces none of its own.
export function summarizeScenario(model: SimModel, limits: CategoryLimits): string {
  const results = categoryResults(model, limits);
  const changed = results.filter(result => result.changed);
  if (changed.length === 0) return 'Move a slider to see how a different limit would change your month.';
  const saved = changed.reduce((sum, result) => sum + result.savedCents, 0);
  const left = projectedLeftCents(model, limits);
  const names = listNames(changed.map(result => result.category.label));
  const limitsText = changed.length === 1 ? `this ${names} limit` : `these ${names} limits`;
  const parts = [saved > 0
    ? `Holding to ${limitsText} would save about ${formatCents(saved)} by the end of ${model.monthLabel}, leaving ${formatCents(left)} of your ${formatCents(totalPlanCents(model))} plan unspent.`
    : `Holding to ${limitsText} would not change your projected spending this month, leaving ${formatCents(left)} of your ${formatCents(totalPlanCents(model))} plan unspent.`];
  const over = changed.filter(result => result.status === 'over-limit');
  if (over.length) parts.push(`${listNames(over.map(result => result.category.label))} ${over.length === 1 ? 'is' : 'are'} already past the new limit, and that spending cannot be undone.`);
  const capped = changed.filter(result => result.dailyAllowanceCents !== null);
  if (capped.length) parts.push(`To stay within ${capped.length === 1 ? 'it' : 'them'}, keep ${listNames(capped.map(result => `${result.category.label} to ${formatCents(result.dailyAllowanceCents!)} a day`))}.`);
  return parts.join(' ');
}

export const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map(word => word[0]!.toUpperCase()).join('') || '?';

export const nextDraftName = (existing: Scenario[]) => {
  let n = existing.length + 1;
  while (existing.some(scenario => scenario.name === `New scenario ${n}`)) n++;
  return `New scenario ${n}`;
};
