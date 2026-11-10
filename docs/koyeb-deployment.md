# Move the API from Render to Koyeb

Status: deployment files prepared; Koyeb account setup, deployment, and traffic cutover are pending. Do not describe Koyeb as live until verified. The current Vercel API rewrite still targets the suspended Render service.

## Create the service

[Open the preconfigured Free deployment](https://app.koyeb.com/deploy?type=git&builder=dockerfile&repository=github.com%2FCSE416Project%2FCSE-416-Project&branch=main&name=cse416-divvy-api&service_type=web&instance_type=free&regions=was&ports=8000%3Bhttp%3B%2F&dockerfile=Dockerfile.koyeb)

Use the existing repository's `main` branch, repository root as the work directory, Docker builder, and `Dockerfile.koyeb`. Select one **Free** web instance in Washington, D.C., port **8000 / HTTP**, route `/`, and HTTP health check `/api/health`. Review the workspace plan too: do not accept a paid Pro workspace or paid instance for this migration. Signup may require card verification. If deploying through a public repository URL, automatic deploys may be disabled; connecting the GitHub App to this repository enables Git-based deployments.

The image uses Node 22, Debian's TLS/OpenSSL dependencies, generated Prisma Client, and compiled shared/server workspaces. The frontend remains on Vercel. Prisma CLI remains available for migrations at startup; the container runs as the non-root `node` user. No live database is needed during image build. The existing receipt processing libraries and background-job implementation are preserved.

## Copy configuration securely

Copy environment variables directly from the current Render service's Environment page into Koyeb. Never put secrets in the deployment URL, Git, screenshots, or chat.

Preserve the exact existing `DATABASE_URL`, `JWT_SECRET`, and `BANK_TOKEN_KEY`. Keep the existing Prisma database; do not create or seed another database. Keeping the encryption key preserves access to existing encrypted bank tokens. Keep the small database connection pool configured in the current URL.

Set `NODE_ENV=production`, `PORT=8000`, `CORS_ORIGIN=https://cse-416-project-tau.vercel.app`, and `APP_ORIGIN=https://cse-416-project-tau.vercel.app`.

Copy all configured Google, Plaid, Azure, Resend, password-reset, weekly-email, and receipt-quota settings. Consult `.env.example` and `server/src/config/env.ts` for names. Copy actual existing values, not the local-development placeholders. Preserve `PLAID_ENV` and weekly-email enablement rather than enabling live integrations by accident.

## Verify before routing traffic

Wait for a healthy Koyeb deployment and successful `prisma migrate deploy` startup. Confirm `GET /api/health` returns 200 and an unauthenticated protected endpoint returns 401. Check CPU/memory during HEIC conversion: Free has 512 MB RAM and 0.1 vCPU, so image processing needs a real runtime check.

Free instances sleep after an hour without traffic. In-process timers do not provide guaranteed schedules while asleep. Recurring maintenance also runs when groups are read; weekly email timing is best-effort on this tier.

Obtain the exact HTTPS hostname assigned by Koyeb; do not guess it. Only after verification, change `vercel.json`'s `/api/:path*` destination to `https://<verified-koyeb-host>/api/:path*`. Keep the SPA fallback and COOP header. Push the change and deploy the Vercel production project, then verify health and authentication through its same-origin `/api` path.

No TestFlight rebuild is needed solely for the backend-host change: the existing shell loads the same Vercel URL. TestFlight and web users keep the existing Prisma data. External provider permissions and quotas remain independent of hosting.

Keep Render's configuration for rollback. A rollback to Render will only restore service after its billing suspension is resolved. Do not run both active schedulers indefinitely after cutover.
