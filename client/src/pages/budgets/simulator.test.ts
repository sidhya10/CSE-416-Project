import { describe, expect, it } from 'vitest';
import type { ApiPersonalBudget, CategoryKey } from '../../api/budgets.api';
import {
  baselineLeftCents, categoryResults, changedCategories, initials, limitsOf, nextDraftName, paceCents, projectedLeftCents,
  projectedSpendCents, relativeTime, scenarioDeltaCents, summarizeScenario, toSimModel, totalPlanCents,
} from './simulator';

const budget = (limits: Partial<Record<CategoryKey, [number, number]>>): ApiPersonalBudget => ({
  month: '2026-09', daysInMonth: 30, daysLeft: 12, hasBankConnection: true, lastSyncedAt: null,
  categories: (['dining', 'groceries', 'transit', 'shopping', 'other'] as const).map(key => ({ key, plannedCents: limits[key]?.[0] ?? 0, spentCents: limits[key]?.[1] ?? 0 })),
  transactions: { dining: [], groceries: [], transit: [], shopping: [], other: [] },
});
// 18 of 30 days elapsed: dining and shopping are on pace to pass their limits, transit is not.
const model = toSimModel(budget({ dining: [36500, 24800], shopping: [32500, 30100], transit: [20000, 9200] }));

describe('building the model from the budgets API', () => {
  it('keeps only categories with a limit, with labels and the month name', () => {
    expect(model.categories.map(category => category.key)).toEqual(['dining', 'transit', 'shopping']);
    expect(model.categories[0]).toMatchObject({ label: 'Dining', spentCents: 24800, limitCents: 36500 });
    expect(model.monthLabel).toBe('September');
    expect(totalPlanCents(model)).toBe(89000);
    expect(limitsOf(model)).toEqual({ dining: 36500, transit: 20000, shopping: 32500 });
  });
  it('is empty when no limits are set', () => {
    expect(toSimModel(budget({ dining: [0, 5000] })).categories).toEqual([]);
  });
});

describe('projection math', () => {
  const [dining, transit] = model.categories;
  it('projects month-end spending in a straight line, like the budget insights', () => {
    expect(paceCents(dining!, model)).toBe(41333);
    expect(paceCents(transit!, model)).toBe(15333);
  });
  it('never projects below what is already spent, and a limit only caps spending', () => {
    expect(projectedSpendCents(dining!, model, 20000)).toBe(24800);
    expect(projectedSpendCents(dining!, model, 30000)).toBe(30000);
    expect(projectedSpendCents(transit!, model, 25000)).toBe(15333);
  });
  it('totals what is left of the plan under current limits and under a scenario', () => {
    expect(baselineLeftCents(model)).toBe(4667);
    expect(projectedLeftCents(model, { dining: 30000 })).toBe(11167);
    expect(scenarioDeltaCents(model, { dining: 30000 })).toBe(6500);
    expect(scenarioDeltaCents(model, {})).toBe(0);
  });
  it('treats a raised limit as spending more, not as free money', () => {
    expect(scenarioDeltaCents(model, { dining: 40000 })).toBe(-3500);
    expect(scenarioDeltaCents(model, { transit: 25000 })).toBe(0);
  });
  it('reports only the categories that actually differ', () => {
    expect(changedCategories(model, { transit: 15000 }).map(category => category.key)).toEqual(['transit']);
    expect(changedCategories(model, { dining: 36500 })).toHaveLength(0);
  });
});

describe('per-category results', () => {
  it('classifies on track, needs cuts and over limit, with a daily allowance only when cuts are needed', () => {
    const [dining, transit, shopping] = categoryResults(model, { dining: 30000, shopping: 25000 });
    expect(dining).toMatchObject({ status: 'needs-cuts', changed: true, projectedCents: 30000, savedCents: 6500, dailyAllowanceCents: 433 });
    expect(transit).toMatchObject({ status: 'on-track', changed: false, savedCents: 0, dailyAllowanceCents: null });
    expect(shopping).toMatchObject({ status: 'over-limit', projectedCents: 30100, savedCents: 2400, dailyAllowanceCents: null });
  });
  it('has no daily allowance once the month is over', () => {
    const over = toSimModel({ ...budget({ dining: [10000, 12000] }), daysLeft: 0 });
    expect(categoryResults(over, {})[0]).toMatchObject({ status: 'over-limit', dailyAllowanceCents: null });
  });
});

describe('plain-language summary', () => {
  it('asks for a change when nothing moved', () => {
    expect(summarizeScenario(model, {})).toMatch(/Move a slider/);
  });
  it('describes the savings, the remaining plan and the daily cap using only computed figures', () => {
    expect(summarizeScenario(model, { dining: 30000 })).toBe(
      'Holding to this Dining limit would save about $65.00 by the end of September, leaving $111.67 of your $890.00 plan unspent. To stay within it, keep Dining to $4.33 a day.');
  });
  it('warns about spending that cannot be undone and lists several categories', () => {
    const text = summarizeScenario(model, { dining: 30000, shopping: 25000 });
    expect(text).toContain('these Dining and Shopping limits');
    expect(text).toContain('Shopping is already past the new limit, and that spending cannot be undone.');
  });
  it('says so when a change would not affect the projection', () => {
    expect(summarizeScenario(model, { transit: 18000 })).toContain('would not change your projected spending');
  });
});

describe('scenario naming and relative time', () => {
  it('builds two-letter initials from a scenario name', () => {
    expect(initials('Weekend cutback')).toBe('WC');
    expect(initials('  ')).toBe('?');
  });
  it('generates the next free draft name', () => {
    expect(nextDraftName([])).toBe('New scenario 1');
    expect(nextDraftName([{ id: '1', name: 'New scenario 1', limits: {}, savedAt: 0 }])).toBe('New scenario 2');
  });
  it('formats relative time buckets', () => {
    const now = Date.now();
    expect(relativeTime(now - 30000, now)).toBe('just now');
    expect(relativeTime(now - 2 * 3600000, now)).toBe('2h ago');
    expect(relativeTime(now - 26 * 3600000, now)).toBe('yesterday');
    expect(relativeTime(now - 3 * 86400000, now)).toBe('3d ago');
  });
});
