# Weekly summary email

Every Friday at 10:00 Eastern, each user gets one email with their spending, budget alerts and shared activity from the past week. Users with nothing to report that week are skipped. The email is sent through Resend and is off until it is switched on.

## What the email contains

Each section appears only when it has something to show.

| Section | Source |
| --- | --- |
| Alerts & attention | Bank connections that need re-authentication and transactions still to review, then categories over their monthly limit, then categories at 80% or more of it. |
| Spent this week | Personal spending dated in the seven full UTC days before today (bank transactions and the user's share of group expenses), the month's budget used, and the top three categories. |
| Splitting & settling up | Group expenses dated in those seven days that include the user (count, total, what they paid, their share), balances owed and owed to them across active groups, and payments waiting for their confirmation. |
| Coming up | Recurring bills due in the next seven days, with the user's share. |

Today is left out of the week because its transactions are still arriving. The email never includes another member's private budget, and it has no images or scripts. It has an HTML and a plain-text version, and the colors match the app (`client/src/theme.css`).

## Setup

Set these in `.env` (see `.env.example`). `RESEND_API_KEY` is the same key the password reset email uses.

| Variable | Purpose |
| --- | --- |
| `WEEKLY_EMAIL_ENABLED` | `true` to turn the weekly email on. Anything else, or unset, keeps it off. |
| `RESEND_API_KEY` | Resend API key. |
| `WEEKLY_EMAIL_FROM` | Sender, such as `Divvy <hello@yourdomain.com>`. Falls back to `PASSWORD_RESET_FROM`. It must use a Resend-verified domain. For testing only, `onboarding@resend.dev` works but delivers only to the address that owns the Resend account. |
| `WEEKLY_EMAIL_REPLY_TO` | Optional reply address. Falls back to `PASSWORD_RESET_REPLY_TO`. |
| `WEEKLY_EMAIL_ONLY` | Optional comma-separated addresses. When set, only those users are emailed. Use it for testing and leave it empty in production. |

If `WEEKLY_EMAIL_ENABLED=true` but the key or From address is missing, the server logs a warning and sends nothing.

Apply the new migration with `npx prisma migrate deploy`, then `npm run prisma:generate`. It only adds the `WeeklyEmailSend` table. Stop the dev server before regenerating on Windows, or Prisma cannot replace its engine file.

## How sending works

- The API server checks once a minute. From Friday 10:00 Eastern (14:00 UTC in summer, 15:00 UTC in winter) it sends in batches of 50 users, with a short pause between emails to stay under Resend's rate limit.
- A `WeeklyEmailSend` row is created for each user and Friday before anything is sent. It is unique per user and date, so a restart or a second API instance cannot email anyone twice. Its status is `SENDING`, `SENT`, `SKIPPED` (nothing to report) or `FAILED`. The email's idempotency key is `weekly-<userId>-<date>`.
- A failed or interrupted send is retried 10 minutes later, up to 3 attempts in total.
- The email is built as of the scheduled Friday time, so a retry later that day says the same thing. A send that is more than 24 hours late is skipped.

## Previewing locally

Outside production only (nothing here sends mail):

- `/api/digest/sample` shows the wireframe's sample numbers and needs no login.
- `/api/digest/preview` shows the signed-in user's email for this week, or says there is nothing to report.
- Add `?format=text` for plain text or `?format=json` for the data. `?now=2026-10-30T14:00:00Z` builds the preview as if sent at that moment.

With the dev server running, open them at `http://localhost:5173/api/digest/sample`.

## Sending a test email now

The scheduled job only runs on Fridays. To check delivery at any time, send one copy to one address:

```powershell
npm run weekly-email:test --workspace server -- you@example.com            # your real data for this week
npm run weekly-email:test --workspace server -- you@example.com --sample   # the wireframe's sample numbers
```

It needs `RESEND_API_KEY` and a From address in `.env`, but not `WEEKLY_EMAIL_ENABLED`. The subject starts with "[Test]", it writes no send record, and it is disabled in production. Without `--sample` the address must belong to an app user, and the email is skipped if that user has nothing to report. With the sandbox sender `onboarding@resend.dev`, the address must be the one that owns the Resend account.

## Known gaps

- There is no unsubscribe link and no setting to turn the email off, so every user with something to report gets it. Mailbox providers expect bulk email to offer an opt-out, so adding one is the first thing to do before sending to real users.
- Sends are tied to Resend. Swapping providers means replacing `digest.mailer.ts`.
- The job runs inside the API server, so a server that is down all Friday morning sends nothing until it is back, and nothing at all once the 24-hour window passes.
- "Transactions to review" counts every unreviewed bank transaction, so a user who never reviews will see that alert every week.
- Week and "coming up" dates use UTC days, not each user's local time zone.
