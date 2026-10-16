import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/requireAuth.js';
import { CATEGORY_KEYS, MAX_LIMIT_CENTS, type CategoryKey } from './budget.categories.js';
import { BudgetError, groupBudgets, personalBudget, saveGroupPlan, saveLimits } from './budget.service.js';

export const budgetsRouter = Router();
budgetsRouter.use(requireAuth);

const cents = z.number().int().min(0).max(MAX_LIMIT_CENTS);
const limitsBody = z.object({
  limits: z.object(Object.fromEntries(CATEGORY_KEYS.map(key => [key, cents.optional()])) as Record<CategoryKey, z.ZodOptional<typeof cents>>).strict()
    .refine(limits => Object.values(limits).some(value => value !== undefined), 'Provide at least one limit'),
}).strict();
const planBody = z.object({ plannedCents: cents }).strict();

budgetsRouter.get('/personal', async (request, response) => {
  response.json(await personalBudget(request.userId!));
});

budgetsRouter.put('/personal/limits', async (request, response) => {
  const { limits } = limitsBody.parse(request.body);
  response.json(await saveLimits(request.userId!, limits));
});

budgetsRouter.get('/groups', async (request, response) => {
  response.json({ groups: await groupBudgets(request.userId!) });
});

budgetsRouter.put('/groups/:groupId/plan', async (request, response) => {
  const { plannedCents } = planBody.parse(request.body);
  response.json({ groups: await saveGroupPlan(request.userId!, request.params.groupId, plannedCents) });
});

budgetsRouter.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
  if (error instanceof BudgetError) { response.status(error.status).json({ error: error.message }); return; }
  next(error);
});
