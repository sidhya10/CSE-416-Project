# Current-period splits and payment notifications

Any group member can start **Split current expenses** (or **Split Current Total** for a trip). The review contains only unresolved transactions not already assigned to a previous period split. A period is a set of transactions, not a calendar month. Expense dates and original shares are preserved; no extra expense or income is created.

Confirmed reimbursements are subtracted. Existing sent-but-unconfirmed reports remain pending. If the review changes before confirmation, the server rejects the stale request and asks for a new review. A transaction can belong to only one initialized period. Period initialization locks its recorded payer/shares against later expense edits and legacy recurring-cycle edits.

After initialization the user returns to Groups. Both **Groups** and **Home** show:

- A debtor card: **Send [name] $[amount]**, opening a mobile popup to record Venmo, Zelle, PayPal, Cash, Bank transfer or Other after actually sending the money.
- A recipient collection card: reported-sent amount and person count, plus a distinct received-and-confirmed count. Reporting sent does not clear a debt. A recipient must confirm receipt.
- A collection popup listing everyone who owes the recipient, amounts, methods, pending reports and confirmations. The recipient can confirm specific pending reports or flag them as not received.
- An in-app reminder action for unpaid, unreported money. Reminders are persisted, appear for the debtor on Home and Groups, and are limited to one per recipient/sender/period per hour, even if dismissed.
- A persisted notification to the sender when receipt is confirmed or flagged. Notifications can be dismissed only by their recipient.

No payment is transferred by this app. No external email, SMS, or OS push is sent. Cards refresh every 15 seconds while their app tab is visible and when the browser tab becomes visible. Actions refresh their panel and related budget/group summaries immediately.

Group detail retains current transactions, transactions already awaiting settlement, and resolved history in separate sections. Resolved transactions are never included in another period. New transactions can form a new period while earlier periods are still collecting repayments. The button remains available for unfinished splits; if there is nothing new to initialize, it directs the user to existing group-payment cards.

Snapshots retain amounts outstanding when the period started, including a baseline of confirmed payments. Actual progress is calculated from the existing `ExpenseShare`/`ExpensePayment` ledger rather than mutable stored balances. Reports spanning several original expenses create those payment rows in one serializable transaction with stable request keys. Concurrent reports, retries and recipient confirmations cannot double-count money.

## API

All routes require authentication and group membership:

- `GET /api/groups/:id/settlements/preview`: current eligible IDs, source titles, and outstanding total.
- `POST /api/groups/:id/settlements`: `{ clientRequestId, expenseIds, totalCents }`; any member can initialize after reviewing the exact snapshot. Stale or concurrently initialized periods return 409.
- `GET /api/settlements`: membership-scoped periods/progress, current user ID, and unread notices.
- `POST /api/settlements/:id/payments`: `{ recipientId, amountCents, method, clientRequestId }`; report only the signed-in debtor's unreported amount.
- `POST /api/settlements/:id/confirm`: `{ senderId, paymentIds, status: "CONFIRMED" | "ISSUE" }`; only the recipient can resolve those payment IDs.
- `POST /api/settlements/:id/reminders`: `{ recipientId }`; only a creditor with an unreported claim can send this in-app reminder.
- `POST /api/settlement-notices/:id/read`: recipient-only dismissal.

Deleting a group removes its period snapshots and notices with the rest of its shared data. Deleting a recurring schedule retains existing period snapshots, historical expenses and repayments. Archiving remains blocked until all shares are confirmed settled.

## Setup and validation

Apply the new migration and regenerate Prisma before starting the app:

```bash
npx prisma migrate deploy
npm run prisma:generate
npm run dev
```

Use a dedicated test database for automated tests. Coverage includes paid-history exclusion, prior partial payments, multiple periods, stale previews, competing initialization/reporting, idempotency, recipient authorization, persisted methods, reminders/cooldown/dismissal, issue/retry, group deletion, completion, unchanged budget totals, popup behavior and a three-account mobile browser flow. `npm run test:api` now runs both Postman collections.

## Combined group payment cards

Groups and Home show at most one outgoing card and one collection card for each group. New settlement periods add their unresolved amounts to those cards; completed periods stay in expense history. Different recipients appear inside the outgoing popup, and collection progress counts each debtor once across open periods. The collection card shows the amount still outstanding, with reported/confirmed progress beneath it.

Reporting one recipient's combined amount and confirming one debtor's reports commit atomically across their source periods. Snapshot allocations prevent a newly initialized split from silently changing an open payment form. Retry keys prevent duplicate reports. A group reminder includes the combined unsent amount and has a group-wide hourly cooldown. Original expense shares and confirmed payments remain intact; opposite-direction obligations are still recorded separately.

New authenticated member routes: `POST /api/groups/:id/settlement-payments` (`recipientId`, `method`, `clientRequestId`, `allocations: [{batchId, amountCents}]`), `POST /api/groups/:id/settlement-confirmations` (`senderId`, `status`, `allocations: [{batchId, paymentIds}]`), and `POST /api/groups/:id/settlement-reminders` (`recipientId`). No migration or new environment variables are required.
