# Local Development

## Prerequisites

- Node.js 22 or later
- npm 10 or later
- Docker Desktop, or a local PostgreSQL 16 installation

## First-time setup

1. Copy `.env.example` to `.env`.
2. Replace `JWT_SECRET` with a random value containing at least 32 characters.
3. Start PostgreSQL with `docker compose up -d postgres`.
4. Install dependencies with `npm install`.
5. Generate the Prisma client with `npm run prisma:generate`.
6. Create the development database migration with `npm run prisma:migrate -- --name init`.
7. Start the frontend and API with `npm run dev`.

The frontend runs at http://localhost:5173. The API runs at http://localhost:3000, and its health endpoint is http://localhost:3000/api/health.

## Quality checks

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`

Never commit `.env` or real API credentials. Only `.env.example` belongs in version control.
