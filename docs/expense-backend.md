# Expense persistence API

The F1 expense screens now save and load through these APIs. They reuse Vivian’s `Group`, `GroupMembership`, `User`, group routes, and signed-cookie authentication. No parallel group tables are created. Azure parsing is integrated with a persistent cache and requires server credentials; see [receipt parsing](receipt-parsing.md). Receipt file storage is not implemented.

## Setup

From the repository root, configure `.env` as described in the README, start PostgreSQL, and run:

```sh
npm ci
npm run prisma:generate
npx prisma migrate deploy
npm run dev
```

`migrate deploy` applies the committed migrations without resetting existing accounts. `npm run prisma:studio` opens the database GUI. Never reset a shared database to apply this change.

## Data model

- `Group` and `GroupMembership`: Vivian’s existing group identity, roles, and membership. Expense access uses the same memberships. This migration adds only expense-related tables and relations.
- `Expense`: group, creator, one payer, title/date, USD amounts, split mode, version, and a client-generated request UUID.
- `ExpenseItem`: item name, unit price in cents, integer quantity (1–999), and display position. Line totals are calculated as unit price times quantity.
- `ExpenseShare`: ordered participants and their calculated base/total shares. A zero share is valid; the payer is also a participant. These records are the source for personal spending, not the payer's full bank charge.
- `ItemAssignment`: joins an item to its assigned participants. Composite foreign keys prevent assignments crossing expense boundaries.
- `ExpensePayment`: individual reports of payment sent, with an amount and `SENT`, `CONFIRMED`, or `ISSUE` status. The recipient is the expense payer. No money is transferred by this API.

Financial amounts are integer cents. SQL CHECK constraints reject negative amounts and invalid quantities. The backend additionally validates memberships, assignments, and totals. Foreign keys restrict deletion of users/groups referenced by these records. Group deletion returns 409 when expenses exist. Account deletion returns 409 when a user created, paid, or shares an expense, or owns a group with expense history. A member can leave or be removed only after all their payable/receivable shares are confirmed settled. Historical shares and payments stay in the database after removal, with former member names available to remaining members. Departed members lose group access. Account anonymization and financial adjustment flows remain future work.

## Routes

All routes require the existing httpOnly session cookie. Use `credentials: 'include'`, as the current frontend API helper already does.

| Method and path | Behavior |
| --- | --- |
| `GET /api/groups` | List groups the current user belongs to, with member display profiles. |
| `POST /api/groups` | Create a group using Vivian’s existing API. |
| `GET /api/groups/:groupId` | Read a group as a member. |
| `POST /api/groups/:groupId/invitations` | Existing group API adds members/admins according to actor role; body `{ "userIds": ["..."] }`. |
| `GET /api/groups/:groupId/expenses` | Read all group expenses, newest creation first. |
| `POST /api/groups/:groupId/expenses` | Create an expense atomically with its items, shares, and assignments. |
| `GET /api/expenses/:expenseId` | Read expense details as a group member. |
| `PUT /api/expenses/:expenseId` | Creator/payer replaces an expense using its current version. |
| `GET /api/groups/:groupId/balances` | Read derived net balances and personal spending in cents. |
| `POST /api/expenses/:expenseId/payments` | Participant reports a partial/full payment sent. |
| `PATCH /api/expenses/:expenseId/payments/:paymentId` | Expense payer confirms receipt or reports an issue. |

Create a group with:

```json
{
  "name": "Boston weekend",
  "type": "Trip",
  "memberIds": ["friend-user-id"],
  "startDate": "2026-10-10",
  "endDate": "2026-10-12"
}
```

Group types use Vivian’s existing values: `General`, `Trip`, or `Recurring`. Trip dates are mandatory for `Trip`. Owner membership is automatic. The expense API supports up to 100 participants per expense.

Create an expense with a fresh UUID from `crypto.randomUUID()` and real user/group IDs:

```json
{
  "clientRequestId": "844f9f9e-909c-45b9-b26a-b673e2f13772",
  "expense": {
    "title": "Dinner",
    "expenseDate": "2026-10-10",
    "paidByUserId": "payer-user-id",
    "splitMode": "ITEMS",
    "participantIds": ["payer-user-id", "friend-user-id"],
    "items": [
      {
        "name": "Noodles",
        "unitPriceCents": 925,
        "quantity": 2,
        "assignedUserIds": ["payer-user-id", "friend-user-id"]
      }
    ],
    "taxCents": 150,
    "tipCents": 300,
    "otherCents": 0
  }
}
```

For `EQUAL`, omit item assignments (or send empty arrays). All declared participants share the expense equally. For `ITEMS`, every item needs at least one assigned participant. Tax, tip, and other fees are allocated proportionally to assigned item subtotals. Largest-remainder allocation conserves cents; ties follow `participantIds` order. The backend computes all totals/shares rather than accepting client-calculated values. Responses include ordered items/shares, item assignments, and payment records nested under each share. Dates are serialized as ISO timestamps.

Repeat a failed create with the **same** `clientRequestId` to obtain the original expense. Do not reuse it for a different intended expense: the first saved result wins. Creator identity is taken from the session, not the request body.

Edit with `{ "version": 1, "expense": { ... } }`. Successful edits increment `version` and replace items/shares atomically; item IDs can change. A stale version returns 409. Editing is restricted to the creator or current payer. As a provisional policy, any payment history blocks editing (including an issue record) until an explicit adjustment flow is built. The connected UI shows these restrictions and disables the edit button when appropriate.

Report payment with `{ "amountCents": 500, "clientRequestId": "<fresh UUID>" }`. The sender is always the signed-in user. Confirm with `{ "status": "CONFIRMED" }`, or flag with `{ "status": "ISSUE" }`. Only the expense payer may resolve it. Resolved records cannot change to another status. An issue releases that amount for a new report; a repeated report must use a new UUID. Retrying an identical report/confirmation does not count it twice.

## Balances and concurrency

`balanceCents > 0` means money is owed to that user; `< 0` means they owe money. For each expense, the payer is credited its total and each participant is debited their share. Only confirmed payments reduce the resulting debt. `spendingCents` always counts personal shares; repayments do not add spending. Group balances sum to zero.

Shares and confirmed payment records are the source of the ledger calculation; there is no separately editable balance column. This is not yet an append-only audit ledger for financial adjustments.

Writes use serializable transactions. A competing write may return 409; reload and retry with the same create/payment request UUID, or the latest expense version for edits. No partial items/shares are committed on failure. Nonmembers receive 404; authenticated members lacking edit/confirmation authority receive 403. Validation errors return 400.

## Connected frontend

The existing Groups workspace loads saved expenses along with groups, refreshes every 15 seconds and on tab visibility, and puts the newest expenses first. The adapter in `client/src/api/expenses.api.ts` converts the presentation-only `you` alias into the authenticated database user ID. Saved participant order is preserved when editing so new members are not silently added to old splits.

Add/edit screens wait for the API before showing success. Save failures leave the draft on screen with a retryable error. Creation retries retain their request UUID. Payment controls disable during requests, show errors, and reload confirmed server records. Balances are derived from the returned shares and confirmed payments; a sent report alone does not reduce debt.

To try it, create two accounts, add the second account to a General or Trip group, and add an expense. Refresh to check persistence. Sign in as the other account in a separate browser session, report payment, then return as the payer to confirm receipt. The next group refresh updates balances.

The fixture-only component tests retain an explicit in-memory preview path; normal signed-in use always calls the API. The group-wide “Split current expenses” action is disabled for persisted groups because each expense already has its own saved split; group-wide reallocation requires a separate adjustment design.

## Remaining work

- Persistent receipt file storage and expense attachment metadata. Scanning sends the selected file to Azure through the backend and caches extracted values; original files are not stored. See [receipt parsing setup](receipt-parsing.md).
- Category IDs/budget posting and bank matching without duplicate spending.
- Recurring bill generation, persistent private trip budgets/planned expenses, and persistent archiving.
- Financial edits after payment history, refunds, and an append-only adjustment audit ledger.
- Offline drafts/queued writes; an unsaved form is not preserved by reloading.

## Tests

`npm run test --workspace server` requires a disposable PostgreSQL database with all migrations applied. Integration tests register uniquely named users and remove only their own test records. They cover membership/actor checks, persistence across sessions, duplicate requests, quantities/rounding, assignment replacement, stale/concurrent edits, payment confirmation, balance conservation, and deletion protection. Calculation tests compare the backend's outputs with the existing frontend across 434 split scenarios. Existing GitHub Actions runs these tests against PostgreSQL 16 automatically.

Browser tests cover create/reload/edit and separate payer/debtor sessions for item splits and confirmed payments. Run `npm run test:e2e` with a migrated test database and Chromium installed (`npx playwright install chromium`).
