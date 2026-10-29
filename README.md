# Personal & Group Budgeting App

**Team:** Eva · Vivian · Nicole · Sidhya  
**Course:** CSE 416 · Software Engineering  
**Implementation status:** October 22, 2026

## Project Overview

This project is a mobile-responsive web application for young adults who manage personal budgets while regularly sharing expenses with roommates, friends, and travel groups. It combines group expense splitting, settlement tracking, connected bank transactions, and personal category budgets in one application.

The long-term product goal is to reconcile a group expense with the corresponding bank charge so that a payer's personal budget counts only their own share. That reconciliation is **not implemented yet**. The current application supports the group-expense workflow and the personal-budget workflow as connected areas of the same authenticated application, but bank transactions and group shares are not yet matched or deduplicated in personal spending totals.

The app records that payments were sent and received, but it does not move money. It currently supports USD only.

## Current Implementation

### Accounts and profiles

- Register with a required phone number and sign in using a username, email address, or phone number plus password.
- Request an expiring, one-time password-reset link and change a password from Profile after verifying the current password.
- Sign up or sign in with Google Identity Services when Google OAuth is configured.
- Use signed httpOnly session cookies for authentication.
- View and update profile photo, username, name, birthday, and bio.
- View read-only email and phone information.
- Link Google authentication to an existing account only when the verified Google email exactly matches the account email.
- Delete an account when doing so would not erase protected financial history.
- Switch between Light and Dark appearance modes. The preference is stored in the browser and synchronized between tabs.

### Friends and group access

- Search registered users by name, username, email, or phone number. No accounts are displayed before the user searches.
- Add or remove friends and persist friendships in PostgreSQL.
- On browsers that support the Contact Picker API, explicitly select contacts and privately match their email addresses or phone numbers to registered users. Selected contact details are checked but not stored.
- Create groups using members from the authenticated user's friend list.
- Assign Owner, Admin, and Member roles.
- Restrict group data and actions to authenticated group members.
- Add members after group creation. Membership currently takes effect immediately rather than waiting for invitation acceptance.
- Remove or leave a group after required payments are settled.

QR-based friend discovery is not implemented.

### Group types

The application supports three group types:

| Type | Current behavior |
|---|---|
| **General** | Members can add expenses, assign a payer, split costs, and settle balances. |
| **Trip** | Stores trip dates and supports expenses plus locally previewed planned costs. Planned costs and private trip budgets do not currently persist to the backend. |
| **Recurring** | Supports recurring schedules, generated expense cycles, editable cycle payers and shares, and a calendar/detail view. |

All group types share group information, members, expenses, balances, settings, and settlement status.

### Expense entry and splitting

- Add and edit General and Trip expenses.
- Select the member who paid.
- Enter item names, quantities, prices, tax, tip, and additional fees.
- Split an expense equally, by assigned items, or with custom shares.
- Validate on the server that all shares equal the expense total to the cent.
- Persist expenses, items, shares, and receipt attachments in PostgreSQL.
- Return retried expense-creation requests safely through client request IDs.
- Block financial edits after payment history exists until a future adjustment workflow is available.

### Receipt scanning

- Upload JPEG, PNG, PDF, HEIC, or HEIF receipts.
- Convert HEIC/HEIF images to JPEG on the backend.
- Extract receipt items, quantities, prices, tax, and tip with Azure Document Intelligence.
- Require the user to review and explicitly apply extracted data before saving an expense.
- Cache normalized scan results per user and file hash in PostgreSQL.
- Store a selected receipt attachment with the saved expense for authenticated group members to view.
- Enforce configurable application and per-user scan limits.

Receipt scanning currently processes one uploaded file and the first page or primary image. Multi-photo receipt merging is not implemented.

### Current-period settlements

- Any group member can initialize a settlement for expenses that have not already entered a settlement period.
- Previously settled expenses remain in history and do not enter a later settlement again.
- Debtors can report that they sent money and record a payment method.
- Creditors can confirm receipt or report an issue.
- Only confirmed payments reduce the underlying debt.
- A separate Group payments section above the group list displays payment tasks, confirmation tasks, collection progress, and in-app reminders. Home shows its to-do summary near the top, linking to Groups for payment actions.
- Settlement notices persist in PostgreSQL.

The application does not initiate ACH, card, Venmo, Cash App, or other real-money transfers.

### Recurring expenses and group lifecycle

- Create recurring expenses with weekly, monthly, quarterly, semiannual, annual, or custom intervals.
- Configure a default payer and per-member shares.
- Edit the payer and shares for individual cycles.
- Generate recurring expense cycles through an in-process maintenance scheduler coordinated through PostgreSQL.
- Archive groups manually after open splits are resolved.
- Automatically archive inactive groups according to their inactivity setting.
- Restore archived groups.
- Filter and search groups.
- Permanently delete a group as its owner. Permanent deletion removes the group's shared ledger for all members.

### Connected bank accounts

- Connect bank accounts through Plaid Link when Plaid is configured.
- Encrypt Plaid access tokens before storing them.
- Synchronize accounts, balances, and transactions with Plaid's transaction-sync API.
- Update existing transactions by Plaid transaction ID and remove transactions deleted by the provider.
- Rename or hide connected accounts.
- Reauthenticate connections that need attention.
- Disconnect an institution.

The application currently uses Plaid's provider categories as input to its fixed budget categories. It does not yet provide a transaction-review queue, manual recategorization, exclusion, notes, or transaction splitting.

### Personal budgets

- Set and edit monthly limits for Dining, Groceries, Transit, Shopping, and Other.
- Calculate current-month spending from positive transactions in visible connected bank accounts.
- View spending and remaining amounts by category.
- Open a category to view its contributing transactions.
- Display an over-budget item on the Home dashboard when a category exceeds its limit.
- Show a four-month spending and income comparison on Home.
- Display the most recently added group expense and a prominent to-do summary on Home; detailed payment cards are on Groups.

Personal-budget totals currently use bank transactions directly. They do **not** substitute a user's group-expense share for the full bank charge.

### Group budgets

- Set a shared monthly spending plan for a group as an Owner or Admin.
- Compare the group's current-month expense total with its shared plan.
- View how much each member paid and currently owes or is owed.
- Refresh budget and group information while the relevant tab is active.

### What-if simulator

- Load the user's current category limits and spending.
- Adjust category limits in a scenario.
- Project end-of-month spending using the current average daily spending pace.
- Show whether each category is on track, needs reductions, or is already over the proposed limit.
- Calculate a suggested daily allowance when a category is projected to exceed its limit.
- Compare up to two scenarios and apply a scenario's category limits to the real budget.

Saved scenarios (up to eight per user) are stored in PostgreSQL on the user's account, so they persist across reloads, logins, and devices. Saving a scenario never changes the real budget; only applying it does. See [Budget backend](docs/budget-backend.md) for the scenario API.

## Current Limitations and Planned Work

The following product concepts are planned or incomplete and should not be treated as implemented behavior:

- **Bank/group reconciliation:** No matching currently exists between `BankTransaction` and `Expense`. A full bank charge is still counted in personal spending even when the user paid on behalf of a group.
- **Transaction review:** Users cannot yet approve, recategorize, exclude, annotate, or divide synchronized bank transactions.
- **Offline support:** There is no IndexedDB write queue, offline draft persistence, or service worker.
- **Installable PWA support:** The interface is responsive, but a web app manifest and service worker are not configured.
- **External notifications:** In-app settlement notices exist, but Web Push and email fallback are not implemented.
- **Live server events:** The client refreshes relevant data periodically and when the browser tab becomes visible. Server-Sent Events are not implemented.
- **Persistent trip planning:** Planned trip expenses and private trip budgets are local preview state.
- **Advanced insights:** Subscription detection, spending anomaly detection, recurring-charge forecasts, and personalized savings recommendations are not implemented.
- **Debt simplification:** Within-group and cross-group debt netting are not implemented.
- **Multi-currency:** All current financial flows use USD.
- **Receipt merging:** Multiple receipt photos or pages cannot be merged into one scan.

Possible future features also include CSV export, exportable trip summaries, savings goals, budget rollover, payer-balance suggestions, and a curated credit-card benefits tool.

## Technology Stack

### Implemented technologies

| Layer | Technologies | Current use |
|---|---|---|
| Frontend | React 19, TypeScript, Vite | Mobile-responsive interface and client-side application state |
| Styling and charts | CSS | Responsive layouts, theme support, progress bars, and chart-like visualizations |
| Backend | Node.js, Express, TypeScript | Authentication and REST APIs for users, groups, expenses, settlements, budgets, banking, recurring bills, and receipts |
| Database | PostgreSQL, Prisma | Relational persistence and transactional financial operations |
| Authentication | bcrypt, Google Identity Services, signed httpOnly cookies | Identifier/password login, password recovery, Google authentication, and server-managed sessions |
| Bank data | Plaid | Account connection, balance retrieval, and transaction synchronization |
| Receipt processing | Azure Document Intelligence, `heic-convert`, `sharp` | Receipt extraction, HEIC conversion, and image processing |
| File storage | PostgreSQL `bytea` through Prisma `Bytes` | Authenticated storage of selected receipt attachments |
| Scheduled work | In-process scheduler with PostgreSQL coordination | Recurring expense generation and inactive-group archiving |
| Testing | Vitest, Supertest, Playwright, Newman, GitHub Actions | Unit, API, browser, Postman, build, migration, and CI checks |

### Planned technologies

TanStack Query, IndexedDB, Redis/BullMQ, Server-Sent Events, external object storage, Web Push, email notification delivery, Tailwind CSS, and Recharts are not currently part of the implemented application.

## Data and Financial Rules

- Financial values are stored as integer cents.
- Expense shares must equal the total expense amount.
- Retried creates use client-generated request IDs to avoid duplicate expense or payment records.
- Group balances are derived from expense shares and confirmed payments.
- A debtor reporting a payment does not clear the debt until the creditor confirms it.
- Settled expenses do not enter later settlement periods.
- Bank access tokens are encrypted before storage.
- Receipt extraction results require user review before they are applied to an expense.
- Authorization checks prevent nonmembers from reading or modifying group data.

## Running the Application

### Requirements

- Node.js 22 or later
- npm 10 or later
- PostgreSQL

Copy `.env.example` to `.env`, configure `DATABASE_URL` and a strong `JWT_SECRET`, and start PostgreSQL. The included Docker Compose configuration exposes its PostgreSQL container on the documented host port.

```sh
npm ci
npm run prisma:generate
npx prisma migrate deploy
npm run dev
```

Vite normally serves the frontend at `http://localhost:5173`, and the Express server handles `/api` requests.

After pulling migrations or dependency changes, stop the development servers and run:

```sh
npm ci
npm run prisma:generate
npx prisma migrate deploy
npm run dev
```

For Apple Silicon systems reporting a missing Rollup native module, reinstall optional dependencies using the committed lockfile:

```sh
npm ci --include=optional
```

### Optional provider configuration

Password authentication and manual expense entry work without Google, Plaid, Azure, or email-provider credentials. In development, password-reset links are logged by the server when email delivery is not configured.

To deliver password-reset emails, set `APP_ORIGIN` to the public client origin and configure `RESEND_API_KEY` plus `PASSWORD_RESET_FROM` as documented in `.env.example`.

To enable Google sign-in, set `GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID` to the same OAuth Web client ID and configure the local and deployed browser origins in Google Cloud.

To enable receipt scanning, set:

```text
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT
AZURE_DOCUMENT_INTELLIGENCE_KEY
```

To enable connected bank accounts, configure the Plaid variables documented in `.env.example`. Use Plaid Sandbox for development and demonstrations. See [Bank connections (Plaid)](docs/banking-backend.md) for setup, routes, and sandbox testing.

## Tests and Quality Checks

Run all repository checks:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Run the Postman/Newman API collections against the local server:

```sh
npm run test:api
```

Install Chromium once and run the browser tests:

```sh
npx playwright install chromium
npm run test:e2e
```

Use a dedicated PostgreSQL test database with all migrations applied for backend, Postman, and Playwright tests. Browser tests create real accounts, groups, expenses, settlements, and payments in the configured database.

GitHub Actions installs dependencies, validates Prisma, applies migrations to PostgreSQL, runs lint and type checks, executes automated tests, builds the application, and uploads Playwright reports when browser tests fail.

## Supporting Documentation

- [Budget backend](docs/budget-backend.md)
- [Bank connections (Plaid)](docs/banking-backend.md)
- [Expense persistence](docs/expense-backend.md)
- [Current-period settlements](docs/period-settlements.md)
- [Recurring bills and archives](docs/recurring-and-archives.md)
- [Receipt parsing](docs/receipt-parsing.md)
- [Google authentication](docs/google-auth.md)
- [Development notes](docs/development.md)
