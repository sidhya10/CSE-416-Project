import request from 'supertest';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const google = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));
vi.mock('google-auth-library', () => ({ OAuth2Client: class { verifyIdToken = google.verifyIdToken; } }));
const run = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
const emails = new Set<string>();
let app: Awaited<typeof import('../src/app.js')>['app'];
let prisma: Awaited<typeof import('../src/config/database.js')>['prisma'];
let env: Awaited<typeof import('../src/config/env.js')>['env'];
const emailFor = (label: string, gmail = false) => { const email = `${label}-${run}@${gmail ? 'gmail.com' : 'example.com'}`; emails.add(email); return email; };
const nonce = 'google-test-page-nonce-12345678901234567890';
const ticket = (payload: Record<string, unknown>) => ({ getPayload: () => ({ email_verified: true, nonce, ...payload }) });
beforeAll(async () => {
  process.env.GOOGLE_CLIENT_ID = 'test-google-client.apps.googleusercontent.com';
  ({ app } = await import('../src/app.js'));
  ({ prisma } = await import('../src/config/database.js'));
  ({ env } = await import('../src/config/env.js'));
});
beforeEach(() => { google.verifyIdToken.mockReset(); });
afterAll(async () => { await prisma.user.deleteMany({ where: { email: { in: [...emails] } } }); await prisma.$disconnect(); });
const start = async (agent: ReturnType<typeof request.agent>, intent: 'signin' | 'signup' | 'link' | 'recover' = 'signin') => {
  const result = await agent.post('/api/auth/google/start').send({ nonce, intent }).expect(200);
  expect(result.headers['cache-control']).toBe('no-store');
  expect(result.body.clientId).toBe(env.GOOGLE_CLIENT_ID);
  return result.body.state as string;
};
const finish = (agent: ReturnType<typeof request.agent>, state: string, intent: 'signin' | 'signup' | 'link' | 'recover' = 'signin') => agent.post(intent === 'link' ? '/api/auth/google/link' : intent === 'recover' ? '/api/auth/google/recover' : '/api/auth/google').send({ credential: 'google-token', state, ...(intent === 'signup' ? { phone: `+1212${String(Date.now()).slice(-7)}` } : {}) });
const register = async (agent: ReturnType<typeof request.agent>, label: string, gmail = false) => {
  const result = await agent.post('/api/auth/register').send({ name: label, email: emailFor(label, gmail), username: `${label}_${run}`.slice(0, 30), phone: `+1213${String(Date.now() + emails.size).slice(-7)}`, password: 'password1' }).expect(201);
  return result.body.user as { id: string; email: string };
};

describe('Google popup authentication alongside password login', () => {
  it('creates a Google account, verifies the audience, and signs back into the same account', async () => {
    const agent = request.agent(app); const email = emailFor('new');
    google.verifyIdToken.mockResolvedValue(ticket({ sub: `new-${run}`, email, name: 'Google User' }));
    const first = await finish(agent, await start(agent, 'signup'), 'signup').expect(200);
    expect(first.body.user).toMatchObject({ email, hasGoogle: true, hasPassword: false });
    expect(first.body.user.passwordHash).toBeUndefined();
    expect(google.verifyIdToken).toHaveBeenCalledWith({ idToken: 'google-token', audience: env.GOOGLE_CLIENT_ID });
    await agent.get('/api/auth/me').expect(200);
    await agent.post('/api/auth/logout').expect(204);
    const second = await finish(agent, await start(agent)).expect(200);
    expect(second.body.user.id).toBe(first.body.user.id);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });
  it('links a matching Google-authoritative email and keeps the existing password login', async () => {
    const agent = request.agent(app); const owner = await register(agent, 'matching', true);
    const before = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
    await agent.post('/api/auth/logout').expect(204);
    google.verifyIdToken.mockResolvedValue(ticket({ sub: `matching-${run}`, email: owner.email }));
    const result = await finish(agent, await start(agent)).expect(200);
    expect(result.body.user).toMatchObject({ id: owner.id, hasGoogle: true, hasPassword: true });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).passwordHash).toBe(before.passwordHash);
    await agent.post('/api/auth/logout').expect(204);
    const passwordLogin = await agent.post('/api/auth/login').send({ identifier: owner.email, password: 'password1' }).expect(200);
    expect(passwordLogin.body.user.id).toBe(owner.id);
  });
  it('requires password-first linking for a third-party email, then accepts either login method', async () => {
    const agent = request.agent(app); const owner = await register(agent, 'thirdparty');
    await agent.post('/api/auth/logout').expect(204);
    google.verifyIdToken.mockResolvedValue(ticket({ sub: `third-${run}`, email: owner.email }));
    await finish(agent, await start(agent)).expect(409);
    await agent.post('/api/auth/login').send({ identifier: owner.email, password: 'password1' }).expect(200);
    const linked = await finish(agent, await start(agent, 'link'), 'link').expect(200);
    expect(linked.body.user).toMatchObject({ id: owner.id, hasGoogle: true, hasPassword: true });
    await agent.post('/api/auth/logout').expect(204);
    const googleLogin = await finish(agent, await start(agent)).expect(200);
    expect(googleLogin.body.user.id).toBe(owner.id);
  });
  it('rejects linking a Google account with a different email', async () => {
    const agent = request.agent(app); const owner = await register(agent, 'different');
    const googleEmail = emailFor('differentgoogle');
    google.verifyIdToken.mockResolvedValue(ticket({ sub: `different-${run}`, email: googleEmail }));
    const linked = await finish(agent, await start(agent, 'link'), 'link').expect(409);
    expect(linked.body.error).toContain('Email mismatch');
    expect(linked.body.error).toContain(owner.email);
    expect(linked.body.error).toContain(googleEmail);
    expect(await prisma.user.count({ where: { email: googleEmail } })).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).googleSubject).toBeNull();
  });
  it('recovers only an account that already has the exact Google identity connected', async () => {
    const agent = request.agent(app); const owner = await register(agent, 'recover');
    const subject = `recover-${run}`;
    await prisma.user.update({ where: { id: owner.id }, data: { googleSubject: subject } });
    await agent.post('/api/auth/logout').expect(204);
    google.verifyIdToken.mockResolvedValue(ticket({ sub: subject, email: owner.email }));
    const recovered = await finish(agent, await start(agent, 'recover'), 'recover').expect(200);
    expect(recovered.body.resetToken).toEqual(expect.any(String));
    await agent.get('/api/auth/me').expect(401);
    await request(app).post('/api/auth/reset-password').send({ token: recovered.body.resetToken, newPassword: 'recovered2', confirmPassword: 'recovered2' }).expect(200);
    await request(app).post('/api/auth/login').send({ identifier: owner.email, password: 'recovered2' }).expect(200);

    google.verifyIdToken.mockResolvedValue(ticket({ sub: `not-linked-${run}`, email: owner.email }));
    await finish(agent, await start(agent, 'recover'), 'recover').expect(404);
  });
  it('rejects a Google identity or email belonging to another account without changing either user', async () => {
    const agent = request.agent(app); const other = request.agent(app);
    const owner = await register(agent, 'owner'); const stranger = await register(other, 'stranger');
    google.verifyIdToken.mockResolvedValue(ticket({ sub: `occupied-${run}`, email: stranger.email }));
    await finish(agent, await start(agent, 'link'), 'link').expect(409);
    await prisma.user.update({ where: { id: stranger.id }, data: { googleSubject: `occupied-${run}` } });
    google.verifyIdToken.mockResolvedValue(ticket({ sub: `occupied-${run}`, email: emailFor('newemail') }));
    await finish(agent, await start(agent, 'link'), 'link').expect(409);
    expect((await agent.get('/api/auth/me')).body.user.id).toBe(owner.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).googleSubject).toBeNull();
  });
  it('does not replace an already connected Google account', async () => {
    const agent = request.agent(app); const owner = await register(agent, 'already');
    await prisma.user.update({ where: { id: owner.id }, data: { googleSubject: `old-${run}` } });
    google.verifyIdToken.mockResolvedValue(ticket({ sub: `replacement-${run}`, email: owner.email }));
    await finish(agent, await start(agent, 'link'), 'link').expect(409);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).googleSubject).toBe(`old-${run}`);
  });
  it('requires authentication to start or finish profile linking', async () => {
    await request(app).post('/api/auth/google/start').send({ nonce, intent: 'link' }).expect(401);
    await request(app).post('/api/auth/google/link').send({ credential: 'anything', state: 'a'.repeat(64) }).expect(401);
  });
  it('rejects missing, mismatched and wrong-intent state', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/google').send({ credential: 'anything' }).expect(400);
    await finish(agent, 'a'.repeat(64)).expect(401);
    const owner = await register(agent, 'state');
    const state = await start(agent);
    await finish(agent, 'b'.repeat(64)).expect(401);
    await finish(agent, state, 'link').expect(401);
    expect((await agent.get('/api/auth/me')).body.user.id).toBe(owner.id);
    expect(google.verifyIdToken).not.toHaveBeenCalled();
  });
  it('rejects expired/tampered browser attempts', async () => {
    await request(app).post('/api/auth/google').set('Cookie', 'cse416_google_attempt=invalid').send({ credential: 'anything', state: 'a'.repeat(64) }).expect(401);
    const expired = jwt.sign({ nonce, state: 'a'.repeat(64), intent: 'signin', userId: null }, env.JWT_SECRET, { audience: 'cse416-google-popup', expiresIn: -60 });
    await request(app).post('/api/auth/google').set('Cookie', `cse416_google_attempt=${expired}`).send({ credential: 'anything', state: 'a'.repeat(64) }).expect(401);
    expect(google.verifyIdToken).not.toHaveBeenCalled();
  });
  it('ignores a stale Google result after normal email sign-in', async () => {
    const agent = request.agent(app); const owner = await register(agent, 'parallel');
    await agent.post('/api/auth/logout').expect(204);
    const state = await start(agent);
    await agent.post('/api/auth/login').send({ identifier: owner.email, password: 'password1' }).expect(200);
    await finish(agent, state).expect(401);
    expect((await agent.get('/api/auth/me')).body.user.id).toBe(owner.id);
    expect(google.verifyIdToken).not.toHaveBeenCalled();
  });
  it.each(['signature', 'unverified', 'nonce'])('rejects invalid Google proof (%s)', async kind => {
    const agent = request.agent(app); const state = await start(agent);
    if (kind === 'signature') google.verifyIdToken.mockRejectedValue(new Error('Invalid token signature'));
    else google.verifyIdToken.mockResolvedValue(ticket({ sub: 'invalid', email: 'invalid@example.com', ...(kind === 'nonce' ? { nonce: 'wrong' } : { email_verified: false }) }));
    await finish(agent, state).expect(401);
    await agent.get('/api/auth/me').expect(401);
  });
  it('clears a completed attempt so the response cannot be submitted again', async () => {
    const agent = request.agent(app);
    google.verifyIdToken.mockResolvedValue(ticket({ sub: `once-${run}`, email: emailFor('once') }));
    const state = await start(agent, 'signup');
    await finish(agent, state, 'signup').expect(200);
    await finish(agent, state, 'signup').expect(401);
  });
  it('returns a clear configuration error while password login still works', async () => {
    const clientId = env.GOOGLE_CLIENT_ID;
    try {
      env.GOOGLE_CLIENT_ID = undefined;
      await request(app).post('/api/auth/google/start').send({ nonce, intent: 'signin' }).expect(503);
      const agent = request.agent(app); const owner = await register(agent, 'disabled');
      await agent.post('/api/auth/logout').expect(204);
      await agent.post('/api/auth/login').send({ identifier: owner.email, password: 'password1' }).expect(200);
    } finally { env.GOOGLE_CLIENT_ID = clientId; }
  });
});
