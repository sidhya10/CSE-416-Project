# Prisma Postgres production cutover

## Decision and data impact

On November 9, 2026, Neon production reads still returned HTTP 402 because the public-transfer allowance was exhausted. The project owner explicitly authorized switching to Prisma Postgres Free without importing existing data if export remained blocked.

A permanent account-owned database, `divvy-production`, was created in the `cse416-divvy` project in US East (N. Virginia). This is not an expiring anonymous CLI database. The old Neon project remains intact; its users and financial records were not deleted or copied.

All users must register again. Groups, invitations, budgets, expenses, settlements, receipt history, and bank connections start fresh. Connecting a bank account may fetch provider history again; that does not restore the old app records or split associations. Do not mix later Neon exports into production without an explicit reconciliation plan for new Prisma writes.

## Deployment configuration

- Keep the Vercel web client and Render Express API at their existing production URLs.
- Change only Render's `DATABASE_URL`, merging that key rather than replacing all variables. Preserve `JWT_SECRET`, `BANK_TOKEN_KEY`, OAuth, Plaid, receipt-parser, and email credentials.
- Use the TLS PostgreSQL connection from Prisma Console, with a small connection pool (`connection_limit=3`, `pool_timeout=20`). The direct connection supports the existing startup migration command.
- Render starts with `npx prisma migrate deploy` before launching Express. Never use `prisma migrate reset` or `db push` for this cutover.
- Keep credentials out of Git, logs, client variables, screenshots, and this document. `render.yaml` intentionally leaves `DATABASE_URL` as `sync: false`; the live value is managed in Render.
- Vercel forwards `/api/*` to Render. The Capacitor iOS shell loads Vercel, so installed shells use the same backend after reload; no new native archive is required solely for this database change.

## Verification and operation

Verify the Render deployment is live, all versioned migrations applied successfully, and production requests can create an account, authenticate, create/read a group, and retain records across sessions. Check both the direct Render API and Vercel's `/api` forwarding. These checks establish database connectivity, not full live-provider certification for Google, Plaid, or Azure.

The transfer-reduction changes in PR #69 are included in the release: cached GETs, visible-screen polling, separate cached photo delivery, complete open obligations, paginated history, count-only badges, and SQL balance aggregation. Monitor Prisma's operation allowance as well as storage; unlimited database transfer does not mean unlimited queries. Free-plan limits can change: check the workspace usage/billing pages before the presentation.

For rollback, preserve the previous Neon connection securely. Switching back restores availability only when Neon is accessible and would omit new Prisma data; reconcile new writes before any rollback. Export a final backup before retiring infrastructure after the course.
