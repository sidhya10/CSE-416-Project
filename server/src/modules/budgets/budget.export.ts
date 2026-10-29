import { CATEGORY_KEYS, type CategoryKey } from './budget.categories.js';

const CATEGORY_LABELS: Record<CategoryKey, string> = { dining: 'Dining', groceries: 'Groceries', transit: 'Transit', shopping: 'Shopping', other: 'Other' };
const HEADER = ['Date', 'Category', 'Description', 'Amount (USD)', 'Status'];

type ExportTransaction = { merchant: string; date: string; amountCents: number; pending: boolean };
type ExportBudget = { month: string; transactions: Record<CategoryKey, ExportTransaction[]> };

/**
 * Quotes a value only when it needs it. A leading = + - @ (or tab/CR) is prefixed with an apostrophe so spreadsheet
 * apps show a merchant name as text instead of running it as a formula.
 */
export function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** Dollars with two decimals and no symbol, e.g. 1234 -> "12.34" and -500 -> "-5.00", so spreadsheets read it as a number. */
export const csvAmount = (cents: number) => `${cents < 0 ? '-' : ''}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, '0')}`;

/** One row per transaction in the month's personal budget, newest first, as RFC 4180 CSV with a UTF-8 byte order mark for Excel. */
export function budgetCsv(budget: ExportBudget) {
  const rows = CATEGORY_KEYS
    .flatMap(key => budget.transactions[key].map(item => ({ key, ...item })))
    .sort((a, b) => b.date.localeCompare(a.date) || CATEGORY_KEYS.indexOf(a.key) - CATEGORY_KEYS.indexOf(b.key));
  // Amounts are numbers (refunds are negative), so they skip csvField's formula guard.
  const lines = [HEADER, ...rows.map(row => [row.date, CATEGORY_LABELS[row.key], csvField(row.merchant), csvAmount(row.amountCents), row.pending ? 'Pending' : 'Posted'])];
  return {
    filename: `personal-budget-${budget.month}.csv`,
    content: `\uFEFF${lines.map(line => line.join(',')).join('\r\n')}\r\n`,
  };
}
