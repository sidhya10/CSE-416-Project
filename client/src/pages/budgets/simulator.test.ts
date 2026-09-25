import { describe, expect, it } from 'vitest';
import { changedCategories, initials, nextDraftName, projectedLeftCents, relativeTime, scenarioDeltaCents } from './simulator';

const current = { dining: 36500, shopping: 32500, transit: 20000 };

describe('scenario projection math', () => {
  it('sums reductions across categories into a single delta', () => {
    const scenario = { dining: 28000, shopping: 22000, transit: 18000 };
    expect(scenarioDeltaCents(current, scenario)).toBe(21000);
    expect(projectedLeftCents(current, scenario, 42810)).toBe(63810);
  });
  it('treats an increased limit as a negative delta', () => {
    expect(scenarioDeltaCents(current, { ...current, dining: 40000 })).toBe(-3500);
  });
  it('reports only the categories that actually differ', () => {
    const changed = changedCategories(current, { ...current, transit: 15000 });
    expect(changed.map(category => category.key)).toEqual(['transit']);
    expect(changedCategories(current, current)).toHaveLength(0);
  });
});

describe('scenario naming and relative time', () => {
  it('builds two-letter initials from a scenario name', () => {
    expect(initials('Weekend cutback')).toBe('WC');
    expect(initials('  ')).toBe('?');
  });
  it('generates the next free draft name', () => {
    expect(nextDraftName([])).toBe('New scenario 1');
    expect(nextDraftName([{ id: '1', name: 'New scenario 1', limits: current, savedAt: 0 }])).toBe('New scenario 2');
  });
  it('formats relative time buckets', () => {
    const now = Date.now();
    expect(relativeTime(now - 30000, now)).toBe('just now');
    expect(relativeTime(now - 2 * 3600000, now)).toBe('2h ago');
    expect(relativeTime(now - 26 * 3600000, now)).toBe('yesterday');
    expect(relativeTime(now - 3 * 86400000, now)).toBe('3d ago');
  });
});
