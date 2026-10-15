import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
const agent = request.agent(app), other = request.agent(app);
const run = randomUUID().slice(0, 8), ids: string[] = [];
const target = { name: 'Alex Morgan Smith', username: `alex_${run}`, email: `alex.${run}@example.com`, phone: `+1 (212) 555-${String(Date.now()).slice(-4)}`, password: 'password1' };
beforeAll(async () => {
  const owner = await agent.post('/api/auth/register').send({ name: 'Searcher', username: `search_${run}`, email: `search_${run}@example.com`, password: 'password1' }); expect(owner.status).toBe(201); ids.push(owner.body.user.id);
  const created = await other.post('/api/auth/register').send(target); expect(created.status).toBe(201); ids.push(created.body.user.id);
  const second = await request(app).post('/api/auth/register').send({ name: 'Zoe Lee', username: `aaa_${run}`, email: `zzz.${run}@example.com`, password: 'password1' }); expect(second.status).toBe(201); ids.push(second.body.user.id);
});
afterAll(async () => { await prisma.user.deleteMany({ where: { id: { in: ids } } }); await prisma.$disconnect(); });
describe('automatic user search and optional field filters', () => {
  it.each(['Alex Morgan Smith', 'alex morgan', target.username, `@${target.username}`, target.email, target.email.toUpperCase(), target.phone, target.phone.replace(/\D/g, '')])('finds an account using %s without specifying a field', async query => {
    const response = await agent.get('/api/users').query({ query }); expect(response.status).toBe(200);
    expect(response.body.users).toEqual([expect.objectContaining({ id: ids[1] })]);
  });
  it.each([['name', target.name], ['username', target.username], ['email', target.email], ['phone', target.phone.replace(/\D/g, '')]])('supports explicit %s filter', async (field, query) => {
    const response = await agent.get('/api/users').query({ query, field }); expect(response.status).toBe(200); expect(response.body.users).toEqual([expect.objectContaining({ id: ids[1] })]);
  });
  it.each(['name', 'username', 'email'])('sorts results by %s', async sort => {
    const response = await agent.get('/api/users').query({ query: run, sort }); expect(response.status).toBe(200);
    expect(response.body.users).toHaveLength(2);
    const values = response.body.users.map((user: Record<string, string>) => user[sort]); expect(values).toEqual([...values].sort((a, b) => a.localeCompare(b)));
  });
  it('does not return irrelevant, self, or field-mismatched results and requires authentication', async () => {
    expect((await agent.get('/api/users').query({ query: 'nonexistent-'+run })).body.users).toEqual([]);
    expect((await agent.get('/api/users').query({ query: target.email, field: 'username' })).body.users).toEqual([]);
    await request(app).get('/api/users').query({ query: target.email }).expect(401);
    await agent.get('/api/users').query({ field: 'invalid' }).expect(400);
    expect((await agent.get('/api/users').query({ query: `search_${run}` })).body.users).toEqual([]);
  });
});
