import { receiptsRouter } from './modules/receipts/receipt.routes.js';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { ExpenseError } from './modules/expenses/expense.service.js';
import { expensesRouter } from './modules/expenses/expense.routes.js';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { friendsRouter } from './modules/friends/friends.routes.js';
import { groupsRouter } from './modules/groups/groups.routes.js';
import { usersRouter } from './modules/users/users.routes.js';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(cookieParser());
// Receipt uploads have a separate authenticated body limit for HEIC originals.
app.use('/api/receipts', receiptsRouter);
app.use(express.json({ limit: '8mb' }));

app.get('/api/health', (_request, response) => {
  response.status(200).json({ status: 'ok', service: 'cse-416-api' });
});

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/friends', friendsRouter);
app.use('/api/groups', groupsRouter);
app.use('/api', expensesRouter);

app.use((_request, response) => {
  response.status(404).json({ error: 'Not found' });
});

app.use((error: unknown, _request: express.Request, response: express.Response, next: express.NextFunction) => {
  void next;
  if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large') { response.status(413).json({ error: 'Upload too large. HEIC/HEIF supports up to 12 MB; other receipts support up to 4 MB.' }); return; }
  if (error instanceof ExpenseError) { response.status(error.status).json({ error: error.message }); return; }
  if (error instanceof ZodError) { response.status(400).json({ error: 'Invalid request', details: error.issues.map(issue => issue.message) }); return; }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2034' || error.code === 'P2002') { response.status(409).json({ error: 'Conflicting update; reload and retry' }); return; }
    if (error.code === 'P2003') { response.status(409).json({ error: 'Expense history prevents deleting this group or account' }); return; }
  }
  console.error(error);
  response.status(500).json({ error: 'Internal server error' });
});
