import { describe, expect, it } from 'vitest';
import { budgetCsv, csvAmount, csvField } from '../src/modules/budgets/budget.export.js';

const empty = { dining: [], groceries: [], transit: [], shopping: [], other: [] };

describe('budget CSV export', () => {
  it('formats cents as plain dollar amounts', () => {
    expect([0, 5, 100, 1234, 100000, -500, -1].map(csvAmount)).toEqual(['0.00', '0.05', '1.00', '12.34', '1000.00', '-5.00', '-0.01']);
  });

  it('quotes only fields that need it and neutralizes spreadsheet formulas', () => {
    expect(csvField('Trader Joe\'s')).toBe('Trader Joe\'s');
    expect(csvField('Pizza, Pasta')).toBe('"Pizza, Pasta"');
    expect(csvField('The "Best" Cafe')).toBe('"The ""Best"" Cafe"');
    expect(csvField('Line\nBreak')).toBe('"Line\nBreak"');
    for (const risky of ['=SUM(A1)', '+1', '-1', '@cmd']) expect(csvField(risky)).toBe(`'${risky}`);
  });

  it('writes a header, one row per transaction newest first, and a stable filename', () => {
    const { filename, content } = budgetCsv({ month: '2026-10', transactions: {
      ...empty,
      dining: [{ merchant: 'Thai Basil', date: '2026-10-01', amountCents: 1050, pending: false }],
      other: [{ merchant: 'Dinner, with friends', date: '2026-10-03', amountCents: 5000, pending: true }],
      shopping: [{ merchant: 'Refund', date: '2026-10-03', amountCents: -300, pending: false }],
    } });
    expect(filename).toBe('personal-budget-2026-10.csv');
    expect(content).toBe('﻿Date,Category,Description,Amount (USD),Status\r\n'
      + '2026-10-03,Shopping,Refund,-3.00,Posted\r\n'
      + '2026-10-03,Other,"Dinner, with friends",50.00,Pending\r\n'
      + '2026-10-01,Dining,Thai Basil,10.50,Posted\r\n');
  });

  it('writes just the header when there are no transactions', () => {
    expect(budgetCsv({ month: '2026-10', transactions: empty }).content).toBe('﻿Date,Category,Description,Amount (USD),Status\r\n');
  });
});
