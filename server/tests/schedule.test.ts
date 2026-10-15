import { describe, expect, it } from 'vitest';
import { cycleDate } from '../src/modules/recurring/schedule.js';
describe('anchored UTC schedules', () => {
  it.each([
    ['2026-01-31', 1, 'months', 1, '2026-02-28'], ['2026-01-31', 1, 'months', 2, '2026-03-31'],
    ['2024-02-29', 1, 'years', 1, '2025-02-28'], ['2024-02-29', 1, 'years', 4, '2028-02-29'],
    ['2026-01-31', 3, 'months', 1, '2026-04-30'], ['2026-08-31', 6, 'months', 1, '2027-02-28'],
    ['2026-03-07', 1, 'weeks', 1, '2026-03-14'], ['2026-01-01', 10, 'days', 2, '2026-01-21'],
    ['2026-01-31', 2, 'months', 1, '2026-03-31'], ['2026-01-01', 2, 'years', 1, '2028-01-01'],
  ])('%s + %s %s × %s = %s', (start, every, unit, index, expected) => {
    expect(cycleDate(new Date(start), Number(every), String(unit), Number(index)).toISOString().slice(0, 10)).toBe(expected);
  });
});
