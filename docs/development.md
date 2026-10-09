# Local Development

## Prerequisites

- Node.js 22 or later
- npm 10 or later
- Docker Desktop, or a local PostgreSQL 16 installation

## First-time setup

1. Copy `.env.example` to `.env`.
2. Replace `JWT_SECRET` with a random value containing at least 32 characters.
3. Start PostgreSQL with `docker compose up -d postgres`.
4. Install dependencies with `npm ci`.
5. Generate the Prisma client with `npm run prisma:generate`.
6. Apply the committed migrations with `npx prisma migrate deploy`.
7. Start the frontend and API with `npm run dev`.

The frontend runs at http://localhost:5173. The API runs at http://localhost:3000, and its health endpoint is http://localhost:3000/api/health.

Email/password authentication works with the required variables above. For Google sign-in, create a Google OAuth 2.0 web client, add `http://localhost:5173` as an authorized JavaScript origin, and set both `GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID` to that client ID. A Google client secret is not required for the current ID-token flow.

## Quality checks

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`

Never commit `.env` or real API credentials. Only `.env.example` belongs in version control.
