export const CATEGORY_KEYS = ['dining', 'groceries', 'transit', 'shopping', 'other'] as const;
export type CategoryKey = typeof CATEGORY_KEYS[number];

export const MAX_LIMIT_CENTS = 100_000_000;

// Plaid primary categories that are money moving between the user's own accounts, income,
// or loan/credit-card payments. Counting them would double count the spending they pay for.
const NOT_SPENDING = new Set(['INCOME', 'TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS']);
// Only the primary Plaid category is stored, so groceries are told apart from dining by merchant.
const GROCERY_MERCHANT = /grocer|supermarket|trader joe|whole foods|safeway|kroger|aldi|publix|wegmans|sprouts|farmers? market/i;

export type CategorizableTransaction = { category: string | null; name: string; merchant: string | null };

/** The budget category a bank transaction counts toward, or null when it is not spending. */
export function categorize(transaction: CategorizableTransaction): CategoryKey | null {
  if (transaction.category && NOT_SPENDING.has(transaction.category)) return null;
  switch (transaction.category) {
    case 'FOOD_AND_DRINK': return GROCERY_MERCHANT.test(`${transaction.merchant ?? ''} ${transaction.name}`) ? 'groceries' : 'dining';
    case 'TRANSPORTATION': return 'transit';
    case 'GENERAL_MERCHANDISE': return 'shopping';
    default: return 'other';
  }
}

export type MonthWindow = { month: string; start: Date; end: Date; daysInMonth: number; daysLeft: number };

/** The UTC calendar month containing `now`, with `end` exclusive. Bank and expense dates are stored as UTC dates. */
export function monthWindow(now: Date): MonthWindow {
  const year = now.getUTCFullYear(), index = now.getUTCMonth();
  return {
    month: `${year}-${String(index + 1).padStart(2, '0')}`,
    start: new Date(Date.UTC(year, index, 1)),
    end: new Date(Date.UTC(year, index + 1, 1)),
    daysInMonth: new Date(Date.UTC(year, index + 1, 0)).getUTCDate(),
    daysLeft: new Date(Date.UTC(year, index + 1, 0)).getUTCDate() - now.getUTCDate(),
  };
}

/** The `count` UTC calendar months ending with the one containing `now`, oldest first, as `YYYY-MM` keys. */
export function recentMonths(now: Date, count: number): { keys: string[]; start: Date } {
  const keys = Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1 - index), 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
  return { keys, start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1), 1)) };
}
