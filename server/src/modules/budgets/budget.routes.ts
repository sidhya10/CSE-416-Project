import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/requireAuth.js';
import { CATEGORY_KEYS, MAX_LIMIT_CENTS, MAX_SCENARIO_NAME_LENGTH, type CategoryKey } from './budget.categories.js';
import { budgetCsv } from './budget.export.js';
import {
  BudgetError, createScenario, deleteScenario, groupBudgets, homeSummary, listScenarios, personalBudget, saveGroupPlan, saveLimits, updateScenario,
} from './budget.service.js';

export const budgetsRouter = Router();
budgetsRouter.use(requireAuth);

const cents = z.number().int().min(0).max(MAX_LIMIT_CENTS);
const categoryLimits = z.object(Object.fromEntries(CATEGORY_KEYS.map(key => [key, cents.optional()])) as Record<CategoryKey, z.ZodOptional<typeof cents>>).strict()
  .refine(limits => Object.values(limits).some(value => value !== undefined), 'Provide at least one limit');
const limitsBody = z.object({ limits: categoryLimits }).strict();
const scenarioBody = z.object({ name: z.string().trim().min(1).max(MAX_SCENARIO_NAME_LENGTH), limits: categoryLimits }).strict();
const planBody = z.object({ plannedCents: cents }).strict();

budgetsRouter.get('/personal', async (request, response) => {
  response.json(await personalBudget(request.userId!));
});

// Downloads the same month the Budget tab shows, so the file always matches the screen.
budgetsRouter.get('/personal/export.csv', async (request, response) => {
  const { filename, content } = budgetCsv(await personalBudget(request.userId!));
  response.setHeader('Content-Type', 'text/csv; charset=utf-8');
  response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  response.setHeader('Cache-Control', 'no-store');
  // Lets the app read the filename when it runs on a different origin than the API.
  response.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
  response.send(content);
});

budgetsRouter.put('/personal/limits', async (request, response) => {
  const { limits } = limitsBody.parse(request.body);
  response.json(await saveLimits(request.userId!, limits));
});

budgetsRouter.get('/scenarios', async (request, response) => {
  response.json({ scenarios: await listScenarios(request.userId!) });
});

budgetsRouter.post('/scenarios', async (request, response) => {
  const { name, limits } = scenarioBody.parse(request.body);
  response.status(201).json({ scenario: await createScenario(request.userId!, name, limits) });
});

budgetsRouter.put('/scenarios/:id', async (request, response) => {
  const { name, limits } = scenarioBody.parse(request.body);
  response.json({ scenario: await updateScenario(request.userId!, request.params.id, name, limits) });
});

budgetsRouter.delete('/scenarios/:id', async (request, response) => {
  await deleteScenario(request.userId!, request.params.id);
  response.status(204).end();
});

budgetsRouter.get('/home', async (request, response) => {
  response.json(await homeSummary(request.userId!));
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
