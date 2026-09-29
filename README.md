# Personal & Group Budgeting App — Project Specification

**Team:** Eva · Vivian · Nicole · Sidhya  
**Course:** CSE 416 · Software Engineering  
**Last updated:** September 28, 2026

## 1. Problem Statement

Young adults frequently share rent, utilities, groceries, restaurant bills, trips, and other expenses, but their group debts and personal budgets usually live in separate tools. If one person pays a $240 dinner bill for six people, their bank statement reports that they spent $240 on food even though their actual share was only $40. Bill-splitting apps can track what friends owe, while budgeting apps categorize the full bank charge; neither produces an accurate picture of the user's true spending.

Recurring expenses create another layer of friction. Roommates repeatedly coordinate the same rent and utility splits, organizers chase reimbursements across messages and payment apps, and budget-conscious users often abandon tools that require manual transaction entry. The project addresses these problems through one shared system for recording group expenses, tracking settlement, connecting bank transactions, and maintaining an accurate personal budget.

## 2. Product Summary

The app is a mobile-first progressive web application for students, recent graduates, roommates, trip organizers, and other young adults who regularly share costs. Its core job is to let a user split a real bill with a group in under thirty seconds, retain the expense even if the app closes or loses connectivity, and update every participant's balance correctly.

What makes the product unique is its reconciliation between group and personal spending:

- When a user fronts a group expense, only their own share is posted to their personal budget—not the full amount charged to their card.
- Each participant's debt remains visible until the debtor marks it paid and the creditor confirms receipt.
- When the full charge later appears among connected bank transactions, the app can match it using the amount, date, and merchant. After user confirmation, it avoids counting the expense twice.
- Recurring bills can be generated automatically for established groups, reducing repeated coordination among roommates and friends.
- Receipt items, tax, and tip can be assigned fairly while the system verifies that all shares add up to the printed total.

The app records settlements but does not move real money. Version 1 is USD-only and excludes native mobile apps, public social features, and cross-group debt netting. Bank transaction connections are planned through a provider such as Plaid or Teller; provider selection and production access remain to be confirmed.

### Navigation and account flow

The mobile app opens on the Log in screen. Users may move to Create your account, which collects name, username, email, and a password of at least eight characters including a number. Both designs show a Google sign-in option; password reset and Google OAuth require backend integration. After authentication, a persistent bottom navigation bar has four destinations: **Home**, **Budget**, **Groups**, and **Profile**. Home summarizes monthly spending against budget, category spending, month-to-month spending and income, and the difference between imported charges and reconciled personal shares. Budget holds category limits, projections, and what-if planning. Groups lists the user's shared groups. Profile holds account details and settings; the editable fields are profile photo, username, name, and birthday, while email is read-only.

The frontend preview provides the account screens, empty Home and Budget destinations, a Groups workspace, and a Profile tab with Settings, Edit profile, and Account settings screens. Profile edits and group changes are in-session React state; they are not saved to the server or retained after a reload. Account connection and security controls explain when backend support is required. The iPhone status bar shown in Figma is omitted from the web app because the device or browser supplies its own. Actual registration, sessions, and account persistence require backend implementation.

### Group types and flows

There are exactly three group types: **General**, **Trip**, and **Recurring**. Each shares a consistent group header, members, balances, expenses, and settings structure. A group description is visible on its detail screen and editable in group settings.

| Type | Creation and detail behavior |
|---|---|
| General | Members may add expenses and split them whenever needed. |
| Trip | Creation captures trip dates. The detail view shows dates, expenses, and the current user's private trip budget. Members can plan a future expense, estimate their own share and budget impact, then commit an actual expense later. Other members cannot view an individual's private budget. |
| Recurring | The detail view includes a calendar and recurring expenses. An expense starts on a chosen date and repeats weekly, monthly, quarterly, semi-yearly, yearly, or at a custom interval of days, weeks, months, or years. Each cycle has an independently editable payer and per-member amounts; shares must equal the expense total. |

All group types can surface balances and settlement status. Group insights can show shared monthly spending, trip cost per person, common categories, outstanding balances, and increases in recurring expenses when supporting data exists. Before committing a split, show the user's estimated share and how much of the relevant category budget would remain without exposing private budget numbers to other members.

The current Groups preview connects the group list, friend selection, three creation types, detail pages, settings, member addition, recurring schedule and per-cycle payment plans, and private trip budget planning. A left swipe on a group card reveals Archive and Delete actions; the card's actions button provides the same options for keyboard and mouse users. Archived groups move to a separate list and can be restored. Group settings also offers Delete. Deletion requires confirmation and removes the group and its preview data for the current session. General and Trip groups support the expense workflow described below. Some other group actions still show coming-soon notices. Seeded transactions and balances are sample data. Planned costs and recurring cycle allocations remain local preview state. Invitations, server persistence, and access control require backend work. A private trip budget must eventually be stored per user and group, with server authorization preventing other members from reading it.

### Expense splitting and settlement

- Add and edit General and Trip group expenses with payer selection, item quantities, and tax/tip/fees.
- Split equally or by item, with participant assignment and cent-accurate rounding.
- View expense details and role-based payment status, report payments sent, and confirm receipt. Edits preserve recorded payments.
- New expenses update local group balances and the all-groups overview. Automated tests cover the main expense and payment flows.

This is a session-only frontend preview. Receipt files can be selected, but scanning, storage, backend persistence, multi-user settlement, and dashboard/budget reconciliation are not connected. No money moves through the app.


## 3. Technology Stack

| Layer | Technologies | Purpose |
|---|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS | Mobile-first installable PWA and user interface |
| Client data | TanStack Query, IndexedDB | Server-state management, local draft persistence, and offline writes |
| Charts | Recharts | Category, monthly spending, and projection visualizations |
| Backend | Node.js, Express, TypeScript | REST APIs, authentication, groups, expenses, budgets, and imports |
| Database | PostgreSQL, Prisma | Relational financial data and enforcement of money-related constraints |
| Background jobs | Redis, BullMQ | Bank transaction synchronization, recurring bill generation, and scheduled notifications |
| Live updates | Server-Sent Events (SSE) | Group expense and status updates when available |
| Bank data | Plaid or Teller (selection pending) | Connect accounts and retrieve transactions with user consent |
| Document processing | Receipt extraction service (Azure Document Intelligence under evaluation) | Planned structured extraction of receipt items; not integrated yet |
| File storage | S3-compatible object storage | Temporary receipt storage |
| Security | Argon2id, httpOnly session cookies | Password hashing and authenticated sessions |
| Notifications | Web Push with email fallback | Recurring bill reminders, parse completion, and budget warnings |
| Testing and CI | Vitest, Supertest, Playwright, fast-check, GitHub Actions | Unit, API, end-to-end, property-based, and automated integration testing |

PostgreSQL is preferred over MongoDB because expenses, shares, memberships, and ledger entries have strong relationships and transactional requirements. Financial values are represented as integer cents, and balances are computed from ledger activity rather than maintained as freely editable totals.

## 4. Feature Roadmap

### Core Features for M1

| Feature | Owner | Scope |
|---|---|---|
| **F1 — Expense Splitting & Settlement** | Eva | Receipt upload, item assignment, equal and custom splitting, tax/tip reconciliation, share validation, owe/owed tracking, two-sided settlement confirmation, trip settlement, and the expense ledger |
| **F2 — Accounts, Groups & Recurring Bills** | Vivian | Authentication, user profiles, friend discovery by username/phone/QR, group creation and types, membership validation, recurring bill generation, reminders, and notification delivery |
| **F3 — Category Budgets & What-If** | Nicole | Creating and editing category limits, connecting budgets to transactions, over-limit warnings, category charts, and a sandbox for testing changes to budget limits |
| **F4 — Bank Transactions & Projections** | Sidhya | Provider-based bank transaction connection (Plaid or Teller, subject to selection), duplicate and overlap handling, mandatory transaction review, personal dashboard layout, spending projections, and monthly charts |

Each owner is responsible for their feature's screens, API routes, data model, and tests. The group and personal halves connect through four shared interfaces:

1. **Budget posting:** committed personal transactions and group-expense shares must present one consistent transaction shape to the budget layer.
2. **Projection:** the projection engine accepts spending history and category limits, allowing the what-if tool to call it with modified limits.
3. **Expense matching:** imported charges are compared with group expenses using amount, date proximity, and merchant, followed by user confirmation.
4. **Group access:** the expense layer reads membership and group state before allowing participants to be included in a split.

Bank-synced charges are matched to group expenses only after user review. The personal budget counts a group participant's share, including when the full charge appears in that payer's bank feed. Planned future expenses remain estimates until committed and must not enter actual spending totals.

Authentication is implemented first because it blocks multi-user testing. Budgeting and projection work can begin in parallel with fixture transactions before authentication and statement parsing are complete. The team will also use a shared component set and color palette so category and monthly charts have a consistent visual language.

### Additional Features for Future Iterations

- **Card Tier List:** Let users record the cards they own, compare rewards by spending category, and see which card is most useful for a purchase. A later recommendation feature could suggest cards based on spending patterns using a curated dataset and a clear “not financial advice” disclaimer.
- **Within-group debt simplification:** Reduce the number of payments needed to settle a group's balances while preserving the correct totals.
- **Recurring transaction detection:** Identify likely subscriptions and other repeating charges in bank transactions.
- **CSV export:** Allow users to export their transaction and budgeting data for external analysis or recordkeeping.
- **Exportable trip summaries:** Produce a clear summary of trip expenses, participant shares, and settlement status.
- **Anonymous group comparisons:** Compare a user's spending patterns with aggregated, anonymized group averages.
- **Cross-group debt netting:** Optionally simplify balances across multiple groups rather than calculating them only within each group.


## 5. Running the frontend preview and checks

The implemented app currently runs as a frontend preview. Use Node.js 22 or later and npm 10 or later, and run these commands from the repository root. No database, Azure account, or backend configuration is required.

### Start the preview

```sh
npm ci
npm run dev --workspace client
```

Open the URL printed by Vite (normally http://localhost:5173) and select **Explore app preview →**. To try the expense flow, open **Groups**, select a General or Trip group, and use **+ Add expense**. Open a newly created expense from the current expenses list to view its details, payment screens, or edit it.

Preview changes are session-only and are cleared on reload. Authentication, server persistence, and automatic receipt scanning are not connected. If port 5173 is occupied, use the alternate URL printed by Vite.

The backend currently contains setup code and a health endpoint only; it is not required for the frontend preview. Optional backend development notes are in [docs/development.md](docs/development.md).

### Tests and quality checks

Run lint across the repository and type checks, tests, and a production build for the frontend:

```sh
npm run lint
npm run typecheck --workspace client
npm run test --workspace client
npm run build --workspace client
```

To run the browser test, install Chromium once and then run Playwright:

```sh
npx playwright install chromium
npm run test:e2e
```

Playwright starts the frontend automatically when needed. The browser test uses preview data and does not require a database or receipt API.

[GitHub Actions CI](.github/workflows/ci.yml) runs on pushes and pull requests. In addition to frontend checks, it validates the backend/database scaffold: Prisma validation, client generation, migration checks against PostgreSQL, and the API health test. It also runs repository-wide lint, type checks, tests, builds, and the Chromium browser test. Failed runs upload the Playwright report. These scaffold checks do not indicate that backend product features are implemented.
