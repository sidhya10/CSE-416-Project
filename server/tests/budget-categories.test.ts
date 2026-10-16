import { describe, expect, it } from 'vitest';
import { categorize, monthWindow, recentMonths } from '../src/modules/budgets/budget.categories.js';

const tx = (category: string | null, name = 'Store', merchant: string | null = null) => ({ category, name, merchant });

describe('categorize', () => {
  it('maps Plaid primary categories to budget categories', () => {
    expect(categorize(tx('FOOD_AND_DRINK', 'Thai Basil'))).toBe('dining');
    expect(categorize(tx('TRANSPORTATION', 'Uber'))).toBe('transit');
    expect(categorize(tx('GENERAL_MERCHANDISE', 'Amazon'))).toBe('shopping');
    expect(categorize(tx('RENT_AND_UTILITIES', 'Phone bill'))).toBe('other');
    expect(categorize(tx('TRAVEL', 'Airline'))).toBe('other');
  });
  it('puts grocery merchants in groceries, by merchant or transaction name', () => {
    expect(categorize(tx('FOOD_AND_DRINK', 'TRADER JOE S #123', "Trader Joe's"))).toBe('groceries');
    expect(categorize(tx('FOOD_AND_DRINK', 'WHOLE FOODS MKT'))).toBe('groceries');
    expect(categorize(tx('GENERAL_MERCHANDISE', 'Whole Foods'))).toBe('shopping');
  });
  it('files uncategorized spending under other', () => {
    expect(categorize(tx(null))).toBe('other');
  });
  it('skips income, transfers, and loan or card payments', () => {
    for (const category of ['INCOME', 'TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS']) expect(categorize(tx(category))).toBeNull();
  });
});

describe('monthWindow', () => {
  it('covers the UTC calendar month and counts the days left after today', () => {
    const window = monthWindow(new Date('2026-09-18T15:00:00Z'));
    expect(window).toMatchObject({ month: '2026-09', daysInMonth: 30, daysLeft: 12 });
    expect(window.start.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(window.end.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });
  it('handles the last day, February, and year rollover', () => {
    expect(monthWindow(new Date('2026-10-31T23:59:59Z')).daysLeft).toBe(0);
    expect(monthWindow(new Date('2028-02-10T00:00:00Z'))).toMatchObject({ month: '2028-02', daysInMonth: 29, daysLeft: 19 });
    const december = monthWindow(new Date('2026-12-05T00:00:00Z'));
    expect(december.end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('recentMonths', () => {
  it('lists the last months oldest first, across a year boundary', () => {
    const { keys, start } = recentMonths(new Date('2027-02-15T00:00:00Z'), 4);
    expect(keys).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(start.toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });
});
