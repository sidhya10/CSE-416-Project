import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';

const run = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
const username = `identity_${run}`.slice(0, 30);
const email = `identity-${run}@example.com`;
const phoneSuffix = String(Date.now()).slice(-4);
const phone = `+1 (646) 555-${phoneSuffix}`;
const canonicalPhone = `+1646555${phoneSuffix}`;
const agent = request.agent(app);

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe('account identity and password recovery', () => {
  it('requires a valid phone number for account creation', async () => {
    await request(app).post('/api/auth/register').send({ name: 'No Phone', username: `no_phone_${run}`.slice(0, 30), email: `no-phone-${run}@example.com`, password: 'password1' }).expect(400);
  });

  it('logs in by email, username, or normalized phone number', async () => {
    const created = await agent.post('/api/auth/register').send({ name: 'Identity User', username, email, phone, password: 'original1' }).expect(201);
    expect(created.body.user.phone).toBe(canonicalPhone);
    for (const identifier of [email.toUpperCase(), `@${username}`, phone.replace(/[(). -]/g, '')]) {
      await agent.post('/api/auth/logout').expect(204);
      const result = await agent.post('/api/auth/login').send({ identifier, password: 'original1' }).expect(200);
      expect(result.body.user.email).toBe(email);
    }
  });

  it('uses an expiring one-time token without revealing whether an account exists', async () => {
    await agent.post('/api/auth/logout').expect(204);
    const unknown = await request(app).post('/api/auth/forgot-password').send({ identifier: `missing-${run}@example.com` }).expect(202);
    expect(unknown.body.resetToken).toBeUndefined();
    const requested = await request(app).post('/api/auth/forgot-password').send({ identifier: username }).expect(202);
    expect(requested.body.resetToken).toEqual(expect.any(String));
    const reset = await request(app).post('/api/auth/reset-password').send({ token: requested.body.resetToken, newPassword: 'replacement2', confirmPassword: 'replacement2' }).expect(200);
    expect(reset.body.user.email).toBe(email);
    await request(app).post('/api/auth/reset-password').send({ token: requested.body.resetToken, newPassword: 'another333', confirmPassword: 'another333' }).expect(400);
    await request(app).post('/api/auth/login').send({ identifier: email, password: 'original1' }).expect(401);
    await request(app).post('/api/auth/login').send({ identifier: phone, password: 'replacement2' }).expect(200);
  });
});
