import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';

const run = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const emails = ['owner', 'member', 'admin', 'outsider'].map(label => `${label}-${run}@example.com`);
const agents = [request.agent(app), request.agent(app), request.agent(app), request.agent(app)];
const users: { id: string; email: string }[] = [];

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
});

describe('groups, memberships, roles, and invitations', () => {
  it('enforces group membership and shares archives and restores with every user', async () => {
    for (const [index, email] of emails.entries()) {
      const created = await agents[index]!.post('/api/auth/register').send({
        name: ['Owner', 'Member', 'Admin', 'Outsider'][index],
        username: `group_${index}_${run.replace(/-/g, '').slice(-10)}`,
        email,
        phone: `+1211${String(Date.now() + index).slice(-7)}`,
        password: 'password1',
      });
      expect(created.status).toBe(201);
      users.push(created.body.user);
    }

    const created = await agents[0]!.post('/api/groups').send({
      name: 'Backend Group', description: 'Persistent group', type: 'General', color: 'green',
      memberIds: [users[1]!.id],
    });
    expect(created.status).toBe(201);
    const groupId = created.body.group.id as string;
    expect(created.body.group).toMatchObject({
      createdById: users[0]!.id,
      createdBy: { id: users[0]!.id },
      currentUserRole: 'OWNER',
    });
    expect(created.body.group.members).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: users[0]!.id, role: 'OWNER' }),
      expect.objectContaining({ id: users[1]!.id, role: 'MEMBER' }),
    ]));
    expect(created.body.group.invitations).toEqual([
      expect.objectContaining({ invitedUser: expect.objectContaining({ id: users[1]!.id }), status: 'ACCEPTED' }),
    ]);

    const memberGroups = await agents[1]!.get('/api/groups');
    expect(memberGroups.body.groups).toEqual([expect.objectContaining({ id: groupId, currentUserRole: 'MEMBER' })]);
    await agents[3]!.get(`/api/groups/${groupId}`).expect(404);
    await agents[1]!.patch(`/api/groups/${groupId}`).send({ name: 'Unauthorized rename' }).expect(403);
    await agents[1]!.delete(`/api/groups/${groupId}`).expect(403);
    await agents[1]!.post(`/api/groups/${groupId}/invitations`).send({ userIds: [users[3]!.id] }).expect(403);

    const addAdmin = await agents[0]!.post(`/api/groups/${groupId}/invitations`).send({ userIds: [users[2]!.id], role: 'ADMIN' });
    expect(addAdmin.status).toBe(201);
    expect(addAdmin.body.group.members).toEqual(expect.arrayContaining([expect.objectContaining({ id: users[2]!.id, role: 'ADMIN' })]));
    const inviteOutsider = await agents[2]!.post(`/api/groups/${groupId}/invitations`).send({ userIds: [users[3]!.id] });
    expect(inviteOutsider.status).toBe(201);
    expect(inviteOutsider.body.group.members).toEqual(expect.arrayContaining([expect.objectContaining({ id: users[3]!.id, role: 'MEMBER' })]));
    await agents[3]!.get(`/api/groups/${groupId}`).expect(200);

    const renamed = await agents[2]!.patch(`/api/groups/${groupId}`).send({ name: 'Renamed by admin' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.group.name).toBe('Renamed by admin');
    await agents[1]!.post(`/api/groups/${groupId}/archive`).send({ archived: true }).expect(200);
    for (const agent of agents) {
      const list = await agent.get('/api/groups').query({ archived: 'archived' });
      expect(list.body.groups).toEqual([expect.objectContaining({ id: groupId, archiveReason: 'MANUAL' })]);
      const active = await agent.get('/api/groups').query({ archived: 'active' });
      expect(active.body.groups).toEqual([]);
    }
    await agents[3]!.post(`/api/groups/${groupId}/archive`).send({ archived: false }).expect(200);
    for (const agent of agents) {
      const list = await agent.get('/api/groups').query({ archived: 'active' });
      expect(list.body.groups).toEqual([expect.objectContaining({ id: groupId, archivedAt: null })]);
    }
    expect(await prisma.groupMembership.count({ where: { groupId } })).toBe(4);
  });
});
