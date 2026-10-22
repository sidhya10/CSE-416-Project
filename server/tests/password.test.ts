import request from 'supertest';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { verifyPassword } from '../src/modules/auth/auth.service.js';

const run = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
const email = `password-${run}@example.com`;
const googleEmail = `google-password-${run}@example.com`;
const owner = request.agent(app);
let id: string;
const valid = { currentPassword: 'original1', newPassword: 'replacement2', confirmPassword: 'replacement2' };
beforeAll(async () => {
  const result = await owner.post('/api/auth/register').send({ name: 'Password User', username: `pw_${run}`.slice(0, 30), email, phone: `+1207${String(Date.now()).slice(-7)}`, password: 'original1' }).expect(201);
  id = result.body.user.id;
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [email, googleEmail] } } });
  await prisma.$disconnect();
});
describe('password changes', () => {
  it('requires authentication', async () => { await request(app).post('/api/auth/password').send(valid).expect(401); });
  it.each([
    [{ ...valid, confirmPassword: 'mismatch3' }, 'match'],
    [{ ...valid, newPassword: 'short1', confirmPassword: 'short1' }, '8 characters'],
    [{ ...valid, newPassword: 'nonumbers', confirmPassword: 'nonumbers' }, 'number'],
    [{ ...valid, newPassword: 'original1', confirmPassword: 'original1' }, 'different'],
    [{ ...valid, newPassword: '界'.repeat(24) + '1', confirmPassword: '界'.repeat(24) + '1' }, '72 bytes'],
  ])('rejects invalid new passwords', async (body, message) => {
    const result = await owner.post('/api/auth/password').send(body).expect(400);
    expect(result.body.error).toContain(message);
  });
  it('rejects the wrong current password without changing stored credentials', async () => {
    await owner.post('/api/auth/password').send({ ...valid, currentPassword: 'wrong123' }).expect(403);
    expect(await verifyPassword('original1', (await prisma.user.findUniqueOrThrow({ where: { id } })).passwordHash!)).toBe(true);
  });
  it('stores a hash, preserves the session, rejects the old login and accepts the new password', async () => {
    const result = await owner.post('/api/auth/password').send(valid).expect(204);
    expect(result.headers['set-cookie']?.[0]).toContain('HttpOnly');
    const stored = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(stored.passwordHash).not.toBe(valid.newPassword);
    expect(await verifyPassword(valid.newPassword, stored.passwordHash!)).toBe(true);
    await owner.get('/api/auth/me').expect(200);
    await owner.post('/api/auth/logout').expect(204);
    await owner.post('/api/auth/login').send({ identifier: email, password: 'original1' }).expect(401);
    await owner.post('/api/auth/login').send({ identifier: email, password: valid.newPassword }).expect(200);
  });
  it('does not set a password on a Google-only account', async () => {
    const google = await prisma.user.create({ data: { email: googleEmail, username: `gpw_${run}`.slice(0, 30), name: 'Google Only', googleSubject: run } });
    const token = jwt.sign({ sub: google.id }, env.JWT_SECRET, { expiresIn: '1h' });
    await request(app).post('/api/auth/password').set('Cookie', `cse416_session=${token}`).send(valid).expect(400);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: google.id } })).passwordHash).toBeNull();
  });
});
