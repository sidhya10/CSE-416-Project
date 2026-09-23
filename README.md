# Personal & Group Budgeting App — Project Specification

**Team:** Eva · Vivian · Nicole · Sidhya  
**Course:** CSE 416 · Software Engineering  
**Last updated:** September 23, 2026

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

The initial frontend scaffold provides the account screens and four empty destinations in a clearly labeled preview. Actual registration, sessions, and account persistence require backend implementation.

### Group types and flows

There are exactly three group types: **General**, **Trip**, and **Recurring**. Each shares a consistent group header, members, balances, expenses, and settings structure. A group description is visible on its detail screen and editable in group settings.

| Type | Creation and detail behavior |
|---|---|
| General | Members may add expenses and split them whenever needed. |
| Trip | Creation captures trip dates. The detail view shows dates, expenses, and the current user's private trip budget. Members can plan a future expense, estimate their own share and budget impact, then commit an actual expense later. Other members cannot view an individual's private budget. |
| Recurring | Creation captures recurring context. The detail view includes a calendar and recurring expenses. Each recurring expense has its own detail and schedule; the payer may rotate across billing periods. |

All group types can surface balances and settlement status. Group insights can show shared monthly spending, trip cost per person, common categories, outstanding balances, and increases in recurring expenses when supporting data exists. Before committing a split, show the user's estimated share and how much of the relevant category budget would remain without exposing private budget numbers to other members.

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
| Document processing | Receipt extraction service (selection pending) | Structured extraction of receipt items |
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
