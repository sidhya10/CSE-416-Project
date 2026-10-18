# Recurring bills, archives, and discovery

## Recurring expenses

Schedules persist in PostgreSQL. Members of a Recurring group can create a schedule with a title, integer-cent amount, UTC start date, default payer, and exact shares. Supported frequencies are weekly, monthly, quarterly, semi-yearly, yearly, and a custom positive interval in days/weeks/months/years. Defaults and cycle overrides must reference current group members and sum to the bill total. New members are not charged for previous cycles.

The API process runs maintenance at startup and every minute. Group-list requests also run maintenance, so reopening the app catches up after downtime. A database advisory lock coordinates instances, and a unique `(recurringBillId, cycleDate)` prevents duplicate generation. Each transaction advances the persistent cursor only after saving expenses and cycle plans. Work is capped at 500 occurrences per pass; a large backlog continues on subsequent passes. Monthly/yearly dates stay anchored: January 31 becomes February 28/29, then March 31. Dates are interpreted as UTC calendar dates.

Each due occurrence becomes a saved expense with explicit custom shares and uses the existing two-sided payment flow. This records obligations; it does not send money or automatically confirm that a bill was paid. Members edit one upcoming payment plan. Saving payer/shares applies to the next and future ungenerated expenses while preserving start date/frequency and existing expense snapshots. It supersedes ungenerated legacy cycle overrides. The UI has no cycle navigator, use-as-default action, or pause/resume control. A schedule with removed members stops generating until its plan is repaired and saved. Past expenses remain in **Past expenses**.

Deleting a recurring expense requires a confirmation dialog and permanently removes its schedule and overrides. All previously generated expenses, including unpaid ones, their recorded payer/shares, and payments remain available. Archived groups suspend generation; restoring catches up overdue occurrences. Automatic generation is not human activity.


## Shared archives

Only the owner can permanently delete a group, from Settings or the sliding card actions, after a mobile confirmation explaining that all shared group data is unrecoverable. Deletion removes expenses, payments, receipts, schedules, memberships, invitations and group budget plans for everyone. Any member can archive or restore a group for everyone, but manual and automatic archiving require every non-payer share to be fully covered by confirmed payments. Pending, disputed, partial, and offsetting debts block archiving, including when the current viewer owes nothing. Archives retain memberships, expenses, receipts and payment history. The bottom **Archived groups** button opens a separate archive view; manual and inactivity archives have distinct tags. The archive has a compact back header, muted background and dashed group cards, with no search, filters, creation actions or balance overview. Active-page filters do not hide archived groups. Other open clients refresh every 15 seconds or when the tab becomes visible, without requiring a reload.

Groups default to auto-archiving after 60 days without activity. Owners/admins can set 1–3650 days in Group settings and save group details. Activity includes group/membership changes, expense edits/creation, payment reports/confirmations and schedule/plan changes. Access dates are tracked per member and do not reset inactivity. Restoring resets the activity clock.

## Search, filtering and sorting

The active Groups page supports name/description search, type, a selected friend, unresolved/settled/owe/owed status, inclusive creation and access date ranges, and minimum/maximum dollar amounts. Amount filtering uses the selected owe/owed direction (or that amount sort), otherwise the larger of the two amounts. Amounts are outstanding gross amounts, not a net balance. Unresolved splits remain first, including sent payments awaiting confirmation and debts that cancel to a zero net balance. Within each priority tier, the default order is most recently active; creation, personal access, owed and owing sorts are also available.

User search automatically searches full name, username (including `@`), email and phone. Matching is case-insensitive and phone punctuation is ignored. The UI always searches all fields automatically, with name/username/email sorting. Optional field restrictions remain supported by the API. Friendships continue to be listed first. Existing users added to groups have access immediately; there is no acceptance workflow.

## Group creation

The frontend requires at least one friend before proceeding to Customize group. The customization Back button returns to member selection, where Cancel exits to Groups. Explicit Edit members preserves a selection snapshot; Cancel there returns to the draft, while Next commits the revised selection. The member preview wraps to show every person, including the creator. Trip groups no longer show a private trip budget; their session-local planned estimates can be deleted individually.

## API

- `GET /api/groups`: `query`, `archived=active|archived|all` (default all), `friendId`, `type`, `balance=all|owe|owed|unresolved|settled`, `sort=activity|created|accessed|owe|owed`, `createdAfter`, `createdBefore`, `accessedAfter`, `accessedBefore`, `minAmount`, `maxAmount`.
- `GET /api/groups/:id`: records the requesting member's access time.
- `DELETE /api/groups/:id`: owner-only permanent deletion, including shared ledger.
- `DELETE /api/recurring/:id`: member-only schedule deletion, retaining past expenses/payments.
- `POST /api/groups/:id/archive`: `{ "archived": true | false }`, any member, 409 if any split is unresolved.
- `PATCH /api/groups/:id`: accepts `inactivityDays` in addition to group details, owner/admin only.
- `GET/POST /api/groups/:id/recurring`: list/create schedules.
- `PATCH /api/recurring/:id`: update `defaultPlan` and/or `paused`, any member.
- Legacy API `PUT /api/recurring/:id/cycles/:index` (not exposed in the UI): `{ payerId, shares: { userId: cents } }`, any member.
- `GET /api/users`: `query`, optional `field=all|name|username|email|phone`, `sort=name|username|email`.

## Setup and validation

Apply committed migrations with `npx prisma migrate deploy`, regenerate Prisma with `npm run prisma:generate`, and restart the API. No new credentials, Redis service or external cron service are required. At least one API instance must run for automatic maintenance; startup catches up after downtime.

Automated coverage includes month-end/leap-year/custom schedules; duplicate-proof catch-up; default plans and cycle overrides; invalid shares and outsider access; pause/resume and invalid memberships; shared archive/restore, inactivity boundaries and access tracking; all group filter combinations and sort tiers; automatic name/username/email/phone searches; and frontend archive/filter/search controls. Database integration tests run against PostgreSQL in CI.
