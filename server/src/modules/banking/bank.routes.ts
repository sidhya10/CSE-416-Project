import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/requireAuth.js';
import * as banking from './bank.service.js';

export const bankingRouter = Router();
bankingRouter.use(requireAuth);

const exchangeBody = z.object({ publicToken: z.string().min(1) });
const linkTokenBody = z.object({ connectionId: z.string().min(1).optional() });
const accountPatch = z.object({ nickname: z.string().trim().min(1).max(40).nullable().optional(), hidden: z.boolean().optional() });
const category = z.enum(['dining', 'groceries', 'transit', 'shopping', 'other']);
const transactionQuery = z.object({
  query: z.string().trim().max(100).optional(),
  status: z.enum(['all', 'unreviewed', 'reviewed', 'excluded']).default('unreviewed'),
});
const reviewBody = z.object({
  category: category.nullable().default(null),
  excluded: z.boolean().default(false),
  note: z.string().trim().max(500).nullable().default(null),
  reviewed: z.boolean().default(true),
  splits: z.array(z.object({ category, amountCents: z.number().int().positive() })).max(5).default([]),
}).strict();

bankingRouter.get('/accounts', async (request, response, next) => {
  try { response.json({ accounts: await banking.listAccounts(request.userId!) }); } catch (error) { next(error); }
});

bankingRouter.post('/link-token', async (request, response, next) => {
  try {
    const { connectionId } = linkTokenBody.parse(request.body ?? {});
    response.json({ linkToken: await banking.createLinkToken(request.userId!, connectionId) });
  } catch (error) { next(error); }
});

bankingRouter.post('/exchange', async (request, response, next) => {
  try {
    const { publicToken } = exchangeBody.parse(request.body);
    await banking.exchangePublicToken(request.userId!, publicToken);
    response.status(201).json({ accounts: await banking.listAccounts(request.userId!) });
  } catch (error) { next(error); }
});

bankingRouter.post('/connections/:id/reauthenticated', async (request, response, next) => {
  try {
    await banking.markReauthenticated(request.userId!, request.params.id);
    response.json({ accounts: await banking.listAccounts(request.userId!) });
  } catch (error) { next(error); }
});

bankingRouter.delete('/connections/:id', async (request, response, next) => {
  try { await banking.disconnect(request.userId!, request.params.id); response.status(204).end(); } catch (error) { next(error); }
});

bankingRouter.patch('/accounts/:id', async (request, response, next) => {
  try {
    await banking.updateAccount(request.userId!, request.params.id, accountPatch.parse(request.body));
    response.json({ accounts: await banking.listAccounts(request.userId!) });
  } catch (error) { next(error); }
});

bankingRouter.post('/sync', async (request, response, next) => {
  try {
    const added = await banking.syncAll(request.userId!);
    response.json({ added, accounts: await banking.listAccounts(request.userId!) });
  } catch (error) { next(error); }
});

bankingRouter.get('/transactions', async (request, response, next) => {
  try {
    const filters = transactionQuery.parse(request.query);
    response.json({ transactions: await banking.listTransactions(request.userId!, filters) });
  } catch (error) { next(error); }
});

bankingRouter.put('/transactions/:id/review', async (request, response, next) => {
  try {
    response.json({ transaction: await banking.reviewTransaction(request.userId!, request.params.id, reviewBody.parse(request.body)) });
  } catch (error) { next(error); }
});
