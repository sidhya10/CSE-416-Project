import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const google = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));
vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    verifyIdToken = google.verifyIdToken;
  },
}));

const run = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const googleEmail = `google-${run}@example.com`;
const linkedEmail = `linked-${run}@example.com`;
let app: Awaited<typeof import('../src/app.js')>['app'];
let prisma: Awaited<typeof import('../src/config/database.js')>['prisma'];

beforeAll(async () => {
  process.env.GOOGLE_CLIENT_ID = 'test-google-client.apps.googleusercontent.com';
  ({ app } = await import('../src/app.js'));
  ({ prisma } = await import('../src/config/database.js'));
});

beforeEach(() => google.verifyIdToken.mockReset());

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [googleEmail, linkedEmail] } } });
  await prisma.$disconnect();
});

const ticket = (payload: Record<string, unknown>) => ({ getPayload: () => payload });

describe('Google authentication', () => {
  it('verifies a Google credential, creates an account, and starts a session', async () => {
    google.verifyIdToken.mockResolvedValue(ticket({
      sub: `google-sub-${run}`, email: googleEmail, email_verified: true,
      name: 'Google User', picture: 'https://example.com/avatar.png',
    }));
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/google').send({ credential: 'valid-google-id-token' });
    expect(login.status).toBe(200);
    expect(login.body.user).toMatchObject({ email: googleEmail, name: 'Google User', hasGoogle: true, hasPassword: false });
    expect(login.headers['set-cookie']?.[0]).toContain('HttpOnly');
    await agent.get('/api/auth/me').expect(200);
    expect(google.verifyIdToken).toHaveBeenCalledWith({
      idToken: 'valid-google-id-token', audience: 'test-google-client.apps.googleusercontent.com',
    });
  });

  it('links a verified Google identity to an existing email account', async () => {
    const existing = request.agent(app);
    await existing.post('/api/auth/register').send({
      name: 'Linked User', username: `linked_${run.replace(/-/g, '').slice(-12)}`,
      email: linkedEmail, password: 'password1',
    }).expect(201);
    google.verifyIdToken.mockResolvedValue(ticket({
      sub: `linked-sub-${run}`, email: linkedEmail, email_verified: true, name: 'Linked User',
    }));
    const login = await request(app).post('/api/auth/google').send({ credential: 'link-token' });
    expect(login.status).toBe(200);
    expect(login.body.user).toMatchObject({ email: linkedEmail, hasGoogle: true, hasPassword: true });
  });

  it('rejects invalid and unverified Google credentials', async () => {
    google.verifyIdToken.mockRejectedValueOnce(new Error('Invalid token signature'));
    await request(app).post('/api/auth/google').send({ credential: 'invalid' }).expect(401);
    google.verifyIdToken.mockResolvedValueOnce(ticket({ sub: 'unverified', email: 'no@example.com', email_verified: false }));
    await request(app).post('/api/auth/google').send({ credential: 'unverified' }).expect(401);
  });
});
