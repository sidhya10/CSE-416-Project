# Category budgets API

The F3 Budget tab loads and saves through these APIs. They read, and never change, the bank (`BankTransaction`) and expense (`Expense`, `ExpenseShare`, `ExpensePayment`) tables.

## Setup

Apply the new migration with `npx prisma migrate deploy`, then `npm run prisma:generate`. It only adds two tables, so existing data is untouched.

## Data model

- `CategoryLimit`: one row per user and category (`dining`, `groceries`, `transit`, `shopping`, `other`) holding a monthly limit in cents. A missing row, or a limit of `0`, means no limit is set; such a category is never reported as over budget.
- `GroupBudgetPlan`: an optional shared monthly plan in cents for a group, set by an owner or admin. No row means no plan.

Both reject negative amounts with a CHECK constraint, and both are deleted with their user or group.

## Routes

All routes require the session cookie.

| Method and path | Behavior |
| --- | --- |
| `GET /api/budgets/personal` | This month's limits, spending, and transactions per category, plus `daysLeft`, `hasBankConnection`, and `lastSyncedAt`. |
| `PUT /api/budgets/personal/limits` | Body `{ "limits": { "dining": 36500 } }`: upserts the listed categories (integer cents, 0 to 100,000,000) and returns the refreshed personal budget. Unknown categories, extra fields, and an empty object return 400. |
| `GET /api/budgets/groups` | This month's budget for each non-archived group the user belongs to. |
| `PUT /api/budgets/groups/:groupId/plan` | Body `{ "plannedCents": 90000 }`. Owners and admins only (403 for members, 404 for non-members). Returns the refreshed group list. |

## How spending is counted

- Personal spending is the signed-in user's bank transactions dated in the current UTC calendar month, from accounts that are not hidden. Only money leaving an account counts (Plaid amounts above zero), so refunds and deposits are ignored.
- Plaid's primary category decides the budget category: `FOOD_AND_DRINK` is Dining, or Groceries when the merchant or name looks like a grocery store; `TRANSPORTATION` is Transit; `GENERAL_MERCHANDISE` is Shopping; everything else, including uncategorized charges, is Other.
- `INCOME`, `TRANSFER_IN`, `TRANSFER_OUT`, and `LOAN_PAYMENTS` are not spending. They move money between the user's own accounts or pay off cards, so counting them would double count what they pay for. This also hides real loan payments; separating them needs Plaid's detailed category, which the sync does not store.
- Pending transactions count and are labelled pending. Plaid replaces them with the posted charge on a later sync.
- Group spending is the sum of the group's expense totals dated this month. "Who owes whom" uses the same ledger as `GET /api/groups/:groupId/balances`: shares minus confirmed payments, across all months. A reported payment does not reduce a debt until the payer confirms it.

## Connected frontend

The Budget tab fetches when it is first opened and then every 15 seconds while it is open, and when the browser tab becomes visible again. A save replaces the screen's data with the server's response, and a slow refresh can never overwrite a newer save. Failed loads show a retry; failed saves keep the form open with the error.

The Budget tab warns when a category is over its limit. Insights project month-end spending in a straight line and only flag categories that have a limit.

Settling up is not done on this screen. Balances come from the expense ledger, so use the group's expenses to report and confirm payments. No money moves through the app.

## Known gaps

- Group expense shares are not yet posted to personal categories. Expenses have no category, and the reviewed bank-to-expense matching described in the README is not built; adding shares now would double count a group charge that also appears in the payer's bank feed.
- The month is always the current UTC month; there is no month picker and no rollover of unused budget.
- Group plans are shared, not private per-member trip budgets.
- The Home dashboard and the What-if simulator still use sample data.
