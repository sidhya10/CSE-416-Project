import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';

const owner = request.agent(app), other = request.agent(app);
const userIds: string[] = [];
const run = randomUUID().replaceAll('-', '').slice(0, 16);
const limits = { dining: 30000, transit: 15000 };

beforeAll(async () => {
  for (const [index, agent] of [owner, other].entries()) {
    const result = await agent.post('/api/auth/register').send({ name: `Scenario Test ${index}`, username: `scn_${run}_${index}`, email: `scn_${run}_${index}@example.com`, phone: `+1209${String(Date.now() + index).slice(-7)}`, password: 'password1' }).expect(201);
    userIds.push(result.body.user.id);
  }
});

afterAll(async () => {
  // Scenarios are deleted with their user.
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe('what-if scenarios', () => {
  it('requires a session for every scenario route', async () => {
    await request(app).get('/api/budgets/scenarios').expect(401);
    await request(app).post('/api/budgets/scenarios').send({ name: 'A', limits }).expect(401);
    await request(app).put('/api/budgets/scenarios/x').send({ name: 'A', limits }).expect(401);
    await request(app).delete('/api/budgets/scenarios/x').expect(401);
  });

  it('starts empty', async () => {
    const response = await owner.get('/api/budgets/scenarios').expect(200);
    expect(response.body).toEqual({ scenarios: [] });
  });

  it('saves a scenario, trims its name and returns it on later requests', async () => {
    const created = await owner.post('/api/budgets/scenarios').send({ name: '  Weekend cutback  ', limits }).expect(201);
    expect(created.body.scenario).toMatchObject({ name: 'Weekend cutback', limits });
    expect(typeof created.body.scenario.savedAt).toBe('number');
    const listed = await owner.get('/api/budgets/scenarios').expect(200);
    expect(listed.body.scenarios).toHaveLength(1);
    expect(listed.body.scenarios[0]).toMatchObject({ id: created.body.scenario.id, name: 'Weekend cutback', limits });
  });

  it('does not change the real budget limits', async () => {
    const budget = await owner.get('/api/budgets/personal').expect(200);
    expect(budget.body.categories.every((category: { plannedCents: number }) => category.plannedCents === 0)).toBe(true);
  });

  it('updates a scenario in place', async () => {
    const [{ id }] = (await owner.get('/api/budgets/scenarios').expect(200)).body.scenarios as { id: string }[];
    const updated = await owner.put(`/api/budgets/scenarios/${id}`).send({ name: 'Tighter', limits: { dining: 20000 } }).expect(200);
    expect(updated.body.scenario).toMatchObject({ id, name: 'Tighter', limits: { dining: 20000 } });
    const listed = (await owner.get('/api/budgets/scenarios').expect(200)).body.scenarios as { id: string; name: string }[];
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ id, name: 'Tighter' });
  });

  it('keeps each user\'s scenarios private', async () => {
    const [{ id }] = (await owner.get('/api/budgets/scenarios').expect(200)).body.scenarios as { id: string }[];
    expect((await other.get('/api/budgets/scenarios').expect(200)).body.scenarios).toEqual([]);
    await other.put(`/api/budgets/scenarios/${id}`).send({ name: 'Mine now', limits }).expect(404);
    await other.delete(`/api/budgets/scenarios/${id}`).expect(404);
    expect((await owner.get('/api/budgets/scenarios').expect(200)).body.scenarios[0]).toMatchObject({ id, name: 'Tighter' });
  });

  it('rejects invalid names and limits', async () => {
    await owner.post('/api/budgets/scenarios').send({ name: '   ', limits }).expect(400);
    await owner.post('/api/budgets/scenarios').send({ name: 'x'.repeat(41), limits }).expect(400);
    await owner.post('/api/budgets/scenarios').send({ name: 'No limits', limits: {} }).expect(400);
    await owner.post('/api/budgets/scenarios').send({ name: 'Bad category', limits: { travel: 100 } }).expect(400);
    await owner.post('/api/budgets/scenarios').send({ name: 'Negative', limits: { dining: -1 } }).expect(400);
    await owner.post('/api/budgets/scenarios').send({ name: 'Fraction', limits: { dining: 10.5 } }).expect(400);
    await owner.post('/api/budgets/scenarios').send({ name: 'Extra', limits, note: 'x' }).expect(400);
  });

  it('stops at eight saved scenarios and frees a slot when one is deleted', async () => {
    for (let index = 2; index <= 8; index++) await owner.post('/api/budgets/scenarios').send({ name: `Scenario ${index}`, limits }).expect(201);
    const full = await owner.post('/api/budgets/scenarios').send({ name: 'One too many', limits }).expect(409);
    expect(full.body.error).toMatch(/8 saved scenarios/);
    const scenarios = (await owner.get('/api/budgets/scenarios').expect(200)).body.scenarios as { id: string }[];
    expect(scenarios).toHaveLength(8);
    await owner.delete(`/api/budgets/scenarios/${scenarios[0]!.id}`).expect(204);
    await owner.post('/api/budgets/scenarios').send({ name: 'Fits now', limits }).expect(201);
  });

  it('returns 404 for a scenario that does not exist', async () => {
    await owner.put('/api/budgets/scenarios/missing').send({ name: 'A', limits }).expect(404);
    await owner.delete('/api/budgets/scenarios/missing').expect(404);
  });
});
