# Vercel deployment

## Current status

Production cutover completed on November 10, 2026, at the existing app hostname. The existing Render database, session-signing, bank-encryption, Google/Azure settings and receipt quotas were transferred to Vercel production; the temporary export was deleted. Supplied Resend and production Plaid settings remain in place. The new migration applied successfully. Render stays suspended for rollback.

Verified on production: health, protected scheduler authentication, registration, session reads, password login, group create/list/delete, native image conversion, expense/receipt persistence and binary download, Google sign-in challenge creation, production Plaid Link-token creation, and Azure OCR of a synthetic receipt. Disposable account/group/expense records were deleted. This did not link a real bank account or complete an interactive Google sign-in.

The November 10 cutover CI baseline passed migrations, lint, typechecking, 214 frontend tests, 251 backend tests, both API collections, builds, and 11 browser tests.

The November 11 release includes merged PRs #71 (native Google sign-in) and #72 (mobile layout and stable group avatars). Local lint, typechecking, 223 frontend tests, and the production build passed. The new GitHub Actions runs remain queued; the new iOS simulator build job has not yet verified compilation. There are 26 existing database migrations and no new schema changes in these merges. Production deployment runs `prisma migrate deploy` against the existing Prisma database and preserves accounts and demo content.

## Configuration

Use the existing Vercel project and hostname. The project currently has no connected Git repository; deploy reviewed commits explicitly through Vercel, or connect the organization repository to enable future automatic deployments. Generic previews have an intentionally unreachable placeholder database and a separate signing key for bundle/health checks only; database features require an isolated test database. `vercel.json` builds the Vite frontend and routes `/api/*` to `api/index.ts` via an explicit wildcard API rewrite. The handler imports the Express app, not the standalone server, so no interval timers or listening socket are started. Functions have a 300-second maximum duration. Native receipt conversion dependencies and Prisma engines are explicitly included.

Store these only in the production server environment: `DATABASE_URL`, `JWT_SECRET`, `BANK_TOKEN_KEY`, `GOOGLE_CLIENT_ID`, `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT`, `AZURE_DOCUMENT_INTELLIGENCE_KEY`, `RESEND_API_KEY`, `PLAID_CLIENT_ID`, `PLAID_SECRET`, and a random `CRON_SECRET` of at least 32 characters. Preserve the existing JWT and bank-encryption keys so sessions and stored bank tokens remain usable. Keep database connection pooling conservative; each concurrent function instance can create its own pool.

Set `NODE_ENV=production`, `APP_ORIGIN=https://cse-416-project-tau.vercel.app`, and matching `CORS_ORIGIN`. Preserve receipt quota settings from Render. Set `PLAID_ENV=production`. Never expose server secrets under a `VITE_` prefix or commit their values. The public Google client ID remains `VITE_GOOGLE_CLIENT_ID` for the browser. Use an isolated test database and Sandbox integrations for previews, not production financial credentials.

The requested Resend and production Plaid settings have been saved in Vercel's production environment. Empty `PASSWORD_RESET_FROM` disables password-reset email delivery. `Divvy <onboarding@resend.dev>` is Resend's testing sender and can only deliver to the Resend account owner's email; a verified sending domain is required to email other testers. Weekly email is enabled as requested, but that sender limitation still applies. Sandbox Plaid access tokens do not work in Production: users must reconnect those accounts.

## Database and receipts

The production build runs Prisma generation and `prisma migrate deploy` before building the client. It must have working database credentials. Preview builds skip migrations; provision and migrate an isolated preview database separately. Never reset or seed the live database as part of deployment.

Vercel's 4.5 MB request limit is below some supported receipt sizes. Files above 2 MB use sequential 1 MB binary chunks, each encoded in a bounded JSON request. Temporary database uploads expire after one hour, require an unpredictable token, and are bound to the authenticated owner (or anonymous guest scope). At most 20 active uploads exist globally and five per client. Expired records are cleaned before allocation and by the daily job. JPEG/PNG/PDF limits remain 4 MB; HEIC/HEIF remain 12 MB. Large PDFs use references when saving expenses. Profile and group photos above 512 KB are resized before upload. These database-backed temporary uploads add transfer; do not treat this as unlimited file storage.

## Schedules

`GET /api/jobs/daily` requires `Authorization: Bearer <CRON_SECRET>` and disables caching. Vercel supplies this header to cron invocations. It cleans temporary uploads, runs recurring-expense maintenance, and checks the existing weekly email window. Recurring group reads also catch up missed cycles.

The Hobby-compatible schedule is daily at 15:00 UTC. Vercel Hobby does not promise precise execution timing; this is approximately 10:00 Eastern in winter and 11:00 in summer, not a guaranteed Friday 10:00 delivery. Weekly sends are deduplicated by user and scheduled date, with a 24-hour send window and a maximum batch of 50. Daily scheduling does not guarantee retries or delivery to more than 50 eligible users within that window. Use a more frequent external scheduler or a suitable paid plan if exact timing, larger batches, or reliable retries are required.

## Cutover verification

1. Review CI: lint, API and client typechecking, database migrations, backend/frontend tests, API collections, build, and browser tests.
2. Configure the remaining production secrets and `CRON_SECRET`, then deploy the reviewed commit. Confirm migration success and function dependency tracing in build logs.
3. Verify `/api/health` returns JSON, unknown API paths return JSON 404, and nested frontend routes load the SPA.
4. With authorized test accounts, verify sign-in/session persistence, group reads/writes, settlement actions, and owner isolation for receipt uploads. Verify a large PDF attachment and a HEIC conversion on the hosted deployment.
5. Verify Google login, production Plaid Link configuration, and Azure receipt parsing with authorized inputs. Never log access tokens or financial records. Verify the cron returns 401 without its secret; only invoke a valid production job when intended emails and maintenance are authorized.
6. Keep Render suspended as a rollback option. The iOS wrapper loads the same hostname, so API/web-only changes are available immediately. The native Google SDK and mobile configuration changes in this release require a new Xcode archive and TestFlight upload.
