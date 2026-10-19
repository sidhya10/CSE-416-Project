# Bank connections (Plaid) API

The Connected accounts screen links bank accounts through Plaid Link and pulls their transactions into PostgreSQL. The Budget tab reads these tables; see [Category budgets API](budget-backend.md). No money moves through the app, and Plaid is used for read-only transaction data.

## Setup

1. Create a Plaid developer account and copy the client ID and sandbox secret.
2. Set these in `.env` (see `.env.example`):

   | Variable | Purpose |
   | --- | --- |
   | `PLAID_CLIENT_ID`, `PLAID_SECRET` | Plaid credentials. If either is missing, every route that calls Plaid returns 503 "Bank connections are not configured on this server". |
   | `PLAID_ENV` | `sandbox` (default) or `production`. |
   | `BANK_TOKEN_KEY` | Optional, at least 32 characters. Encrypts stored access tokens. Defaults to a key derived from `JWT_SECRET`. |

3. Apply the migration with `npx prisma migrate deploy`, then `npm run prisma:generate`. It only adds three tables, so existing data is untouched.

Keep `BANK_TOKEN_KEY` (or `JWT_SECRET` if the key is unset) stable. Changing it makes stored tokens undecryptable, and users must reconnect their banks.

## Data model

- `BankConnection`: one Plaid Item per linked institution. Holds the institution name, the encrypted access token, the Plaid sync cursor, `status` (`ACTIVE` or `NEEDS_ATTENTION`), `statusDetail`, and `lastSyncedAt`. `plaidItemId` is unique.
- `BankAccount`: the accounts under a connection, with Plaid name, last four digits, `balanceCents`, an optional user `nickname`, and a `hidden` flag.
- `BankTransaction`: amount in integer cents, date, name, merchant, Plaid primary category, and `pending`. `plaidTransactionId` is unique, so repeated syncs update rather than duplicate.

Deleting a user deletes their connections, accounts, and transactions.

## Routes

All routes are under `/api/banking` and require the session cookie.

| Method and path | Behavior |
| --- | --- |
| `GET /accounts` | The user's accounts with institution, nickname, last four digits, balance, `hidden`, `status` (`synced` or `needs-attention`), `statusDetail`, and `syncedAt`. |
| `POST /link-token` | Optional body `{ "connectionId": "..." }`. Without it, returns a Link token for a new connection. With it, returns an update-mode token for re-authenticating that connection (404 if it is not the user's). |
| `POST /exchange` | Body `{ "publicToken": "..." }`. Exchanges the Link public token, stores the encrypted access token and accounts, runs a first sync, and returns the accounts with status 201. |
| `POST /sync` | Syncs every `ACTIVE` connection and returns `{ added, accounts }`. A connection that fails is skipped and counts as zero. |
| `POST /connections/:id/reauthenticated` | Call after update-mode Link succeeds. Marks the connection `ACTIVE` and syncs it. |
| `PATCH /accounts/:id` | Body `{ "nickname": "Checking", "hidden": true }`. Nickname is 1 to 40 characters or `null` to clear. Other users' accounts return 404. |
| `DELETE /connections/:id` | Revokes the Item at Plaid, then deletes the connection with its accounts and transactions. Returns 204. |

## How sync works

- Sync uses Plaid's cursor-based `transactions/sync`. It pages through added, modified, and removed transactions and saves the new cursor, so each sync only fetches changes.
- Added and modified transactions are upserted by Plaid transaction ID. Removed ones are deleted. Pending charges are replaced by the posted charge on a later sync.
- Balances are refreshed on every sync. Credit and loan balances are stored as negative numbers because Plaid reports them as amounts owed.
- If data changes while paging, Plaid returns `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION`. The sync restarts from the last saved cursor once.
- The cursor, balances, and transactions are written in one database transaction, so a failed sync leaves the previous state intact.
- A failed first sync during `/exchange` does not undo the link. Use Sync now to retry.
- `ITEM_LOGIN_REQUIRED`, `PENDING_EXPIRATION`, or `PENDING_DISCONNECT` set the connection to `NEEDS_ATTENTION` with "Consent expired". `POST /sync` skips it until the user re-authenticates.
- If Plaid fails during disconnect, the local record is kept so the user can retry. An `ITEM_NOT_FOUND` response is treated as already revoked.

## Security

- Access tokens never leave the server. They are encrypted with AES-256-GCM (random IV and auth tag per token) before being stored, and are never returned by any route.
- Every query is scoped to the signed-in user, and accounts or connections that belong to someone else return 404.
- Plaid credentials are server-side only and must never use a `VITE_` prefix.

## Connected frontend

Connected accounts lets the user connect a bank through Plaid Link, rename or hide accounts, re-authenticate a connection that needs attention, disconnect, and run Sync now. Sync now is disabled unless at least one visible account is synced. After a sync it shows how many new transactions were imported. Hidden accounts are excluded from budget spending.

## Testing in the Plaid sandbox

1. Set sandbox credentials in `.env` and run `npm run dev`.
2. Open Connected accounts and connect a bank. In Plaid Link, choose any institution and sign in with username `user_good` and password `pass_good`.
3. Confirm the accounts appear with balances, then press Sync now and check that transactions appear in the Budget tab.
4. Rename and hide an account, then check that a hidden account's spending leaves the Budget tab.
5. Disconnect and confirm the accounts and their transactions disappear.

Automated tests in `server/tests/banking.test.ts` mock Plaid, so they use no sandbox quota. They cover token encryption, link and exchange, incremental sync with modified and removed transactions, re-authentication, disconnect, and request validation.

## Known gaps

- Sync runs only when the user presses Sync now. There is no webhook or scheduled sync, and the Automatic sync toggle on the screen is not wired to the server yet.
- Only the Transactions product is requested. Plaid's detailed category is not stored.
- Reviewed matching of bank charges to group expenses, and avoiding double counting, is not built.
- `production` mode needs Plaid production approval and has not been tested.
