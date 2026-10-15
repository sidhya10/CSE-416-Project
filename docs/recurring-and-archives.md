# Recurring bills, archives, and discovery

## Recurring expenses

Schedules persist in PostgreSQL. Members of a Recurring group can create a schedule with a title, integer-cent amount, UTC start date, default payer, and exact shares. Supported frequencies are weekly, monthly, quarterly, semi-yearly, yearly, and a custom positive interval in days/weeks/months/years. Defaults and cycle overrides must reference current group members and sum to the bill total. New members are not charged for previous cycles.

The API process runs maintenance at startup and every minute. Group-list requests also run maintenance, so reopening the app catches up after downtime. A database advisory lock coordinates instances, and a unique `(recurringBillId, cycleDate)` prevents duplicate generation. Each transaction advances the persistent cursor only after saving expenses and cycle plans. Work is capped at 500 occurrences per pass; a large backlog continues on subsequent passes. Monthly/yearly dates stay anchored: January 31 becomes February 28/29, then March 31. Dates are interpreted as UTC calendar dates.

Each due occurrence becomes a saved expense with explicit custom shares and uses the existing two-sided payment flow. This records obligations; it does not send money or automatically confirm that a bill was paid. Members can edit a cycle's payer/shares until that expense has payment history. Updating the default plan affects ungenerated cycles without overrides, and generated cycles retain their allocation snapshots. Pause/resume is supported. If a default/override references a removed member, generation pauses with a repair message instead of silently reallocating money. Correct the default and any affected cycle override before resuming.

Archived groups suspend generation. Restoring resumes overdue, ungenerated cycles; pause the schedule first if you do not want those obligations generated. Automatically generated expenses do not count as human activity, so a dormant schedule does not keep an otherwise inactive group alive.

## Shared archives

Groups cannot be deleted through the UI or API. Any member can archive or restore a group for everyone. Archives retain memberships, expenses, receipts and payment history. The bottom **Archived groups** button opens a separate archive view; manual and inactivity archives have distinct tags. Other open clients refresh every 15 seconds or when the tab becomes visible, without requiring a reload.

Groups default to auto-archiving after 60 days without activity. Owners/admins can set 1–3650 days in Group settings and save group details. Activity includes group/membership changes, expense edits/creation, payment reports/confirmations and schedule/plan changes. Access dates are tracked per member and do not reset inactivity. Restoring resets the activity clock.

## Search, filtering and sorting

Both active and archived groups support name/description search, type, a selected friend, unresolved/settled/owe/owed status, inclusive creation and access date ranges, and minimum/maximum dollar amounts. Amount filtering uses the selected owe/owed direction (or that amount sort), otherwise the larger of the two amounts. Amounts are outstanding gross amounts, not a net balance. Unresolved splits remain first, including sent payments awaiting confirmation and debts that cancel to a zero net balance. Within each priority tier, the default order is most recently active; creation, personal access, owed and owing sorts are also available.

User search automatically searches full name, username (including `@`), email and phone. Matching is case-insensitive and phone punctuation is ignored. Optional field restrictions and name/username/email sorting are available. Friendships continue to be listed first. Existing users added to groups have access immediately; there is no acceptance workflow.

## API

- `GET /api/groups`: `query`, `archived=active|archived|all` (default all), `friendId`, `type`, `balance=all|owe|owed|unresolved|settled`, `sort=activity|created|accessed|owe|owed`, `createdAfter`, `createdBefore`, `accessedAfter`, `accessedBefore`, `minAmount`, `maxAmount`.
- `GET /api/groups/:id`: records the requesting member's access time.
- `POST /api/groups/:id/archive`: `{ "archived": true | false }`, any member.
- `PATCH /api/groups/:id`: accepts `inactivityDays` in addition to group details, owner/admin only.
- `GET/POST /api/groups/:id/recurring`: list/create schedules.
- `PATCH /api/recurring/:id`: update `defaultPlan` and/or `paused`, any member.
- `PUT /api/recurring/:id/cycles/:index`: `{ payerId, shares: { userId: cents } }`, any member.
- `GET /api/users`: `query`, optional `field=all|name|username|email|phone`, `sort=name|username|email`.

## Setup and validation

Apply committed migrations with `npx prisma migrate deploy`, regenerate Prisma with `npm run prisma:generate`, and restart the API. No new credentials, Redis service or external cron service are required. At least one API instance must run for automatic maintenance; startup catches up after downtime.

Automated coverage includes month-end/leap-year/custom schedules; duplicate-proof catch-up; default plans and cycle overrides; invalid shares and outsider access; pause/resume and invalid memberships; shared archive/restore, inactivity boundaries and access tracking; all group filter combinations and sort tiers; automatic name/username/email/phone searches; and frontend archive/filter/search controls. Database integration tests run against PostgreSQL in CI.
