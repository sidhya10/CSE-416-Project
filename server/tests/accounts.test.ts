import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';

const run = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const ownerEmail = `owner-${run}@example.com`;
const friendEmail = `friend-${run}@example.com`;
const owner = request.agent(app);
const friend = request.agent(app);

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [ownerEmail, friendEmail] } } });
  await prisma.$disconnect();
});

describe('accounts and friendships', () => {
  it('creates, authenticates, reads, updates, searches, befriends, and deletes users', async () => {
    const registered = await owner.post('/api/auth/register').send({
      name: 'Account Owner', username: `owner_${run.replace(/-/g, '').slice(-14)}`, email: ownerEmail,
      phone: `+1555${String(Date.now()).slice(-7)}`, password: 'password1',
    });
    expect(registered.status).toBe(201);
    expect(registered.body.user.email).toBe(ownerEmail);
    expect(registered.headers['set-cookie']?.[0]).toContain('HttpOnly');

    const createdFriend = await friend.post('/api/users').send({
      name: 'Friend Account', username: `friend_${run.replace(/-/g, '').slice(-13)}`, email: friendEmail, password: 'password2',
    });
    expect(createdFriend.status).toBe(201);

    const me = await owner.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.name).toBe('Account Owner');

    const locked = await owner.patch('/api/users/me').send({ email: 'changed@example.com' });
    expect(locked.status).toBe(400);

    const updated = await owner.patch('/api/users/me').send({ name: 'Updated Owner', bio: 'Backend profile', birthday: '1999-12-31' });
    expect(updated.status).toBe(200);
    expect(updated.body.user).toMatchObject({ name: 'Updated Owner', bio: 'Backend profile', birthday: '1999-12-31', email: ownerEmail });

    const search = await owner.get('/api/users').query({ query: friendEmail });
    expect(search.status).toBe(200);
    expect(search.body.users).toEqual(expect.arrayContaining([expect.objectContaining({ id: createdFriend.body.user.id, isFriend: false })]));

    const added = await owner.post(`/api/friends/${createdFriend.body.user.id}`);
    expect(added.status).toBe(201);
    const list = await owner.get('/api/friends');
    expect(list.body.friends).toEqual([expect.objectContaining({ id: createdFriend.body.user.id, isFriend: true })]);

    const detail = await owner.get(`/api/users/${createdFriend.body.user.id}`);
    expect(detail.body.user).toMatchObject({ email: friendEmail, isFriend: true, sharedGroups: [] });

    await owner.post('/api/auth/logout').expect(204);
    const login = await owner.post('/api/auth/login').send({ email: ownerEmail, password: 'password1' });
    expect(login.status).toBe(200);
    await owner.delete('/api/users/me').expect(204);
    await owner.get('/api/auth/me').expect(401);
  });
});
