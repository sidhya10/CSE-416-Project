import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { clearSession, hashPassword, setSession } from '../auth/auth.service.js';
import { presentUser } from './user.presenter.js';

export const usersRouter = Router();
const updateSchema = z.object({
  username: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_]+$/).transform(value => value.toLowerCase()).optional(),
  name: z.string().trim().min(1).max(80).optional(),
  birthday: z.iso.date().optional().or(z.literal('')),
  bio: z.string().trim().max(160).optional(),
  photoUrl: z.string().max(7_000_000).nullable().optional(),
}).strict();
const createSchema = z.object({
  email: z.email().transform(value => value.toLowerCase()), username: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_]+$/).transform(value => value.toLowerCase()),
  password: z.string().min(8).regex(/[0-9]/), name: z.string().trim().min(1).max(80), phone: z.string().trim().min(7).max(24).optional(),
});
const isConflict = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

// REST create is also a registration entry point; the auth route exists for a clearer client API.
usersRouter.post('/', async (request, response, next) => {
  const parsed = createSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Invalid request', details: parsed.error.issues.map(issue => issue.message) });
  try {
    const { password, ...data } = parsed.data;
    const user = await prisma.user.create({ data: { ...data, passwordHash: await hashPassword(password) } });
    setSession(response, user.id);
    return response.status(201).json({ user: presentUser(user) });
  } catch (error) { if (isConflict(error)) return response.status(409).json({ error: 'That email, username, or phone number is already in use' }); next(error); }
});

usersRouter.use(requireAuth);

usersRouter.get('/', async (request, response, next) => {
  const currentUserId = request.userId!;
  const query = typeof request.query.query === 'string' ? request.query.query.trim() : '';
  try {
    const [users, friendships] = await Promise.all([
      prisma.user.findMany({ where: { id: { not: currentUserId }, ...(query ? { OR: [
        { name: { contains: query, mode: 'insensitive' } }, { username: { contains: query.replace(/^@/, ''), mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } }, { phone: { contains: query } },
      ] } : {}) }, orderBy: [{ name: 'asc' }] }),
      prisma.friendship.findMany({ where: { OR: [{ userOneId: currentUserId }, { userTwoId: currentUserId }] } }),
    ]);
    const friendIds = new Set(friendships.map(item => item.userOneId === currentUserId ? item.userTwoId : item.userOneId));
    return response.json({ users: users.map(user => ({ ...presentUser(user), isFriend: friendIds.has(user.id) })).sort((a, b) => Number(b.isFriend) - Number(a.isFriend) || a.name.localeCompare(b.name)) });
  } catch (error) { next(error); }
});

usersRouter.get('/me', async (request, response, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: request.userId! } });
    if (!user) return response.status(404).json({ error: 'User not found' });
    return response.json({ user: presentUser(user) });
  } catch (error) { next(error); }
});

usersRouter.patch('/me', async (request, response, next) => {
  const parsed = updateSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Only name, username, birthday, bio, and profile photo can be changed', details: parsed.error.issues.map(issue => issue.message) });
  try {
    const data = { ...parsed.data, birthday: parsed.data.birthday ? new Date(`${parsed.data.birthday}T00:00:00.000Z`) : parsed.data.birthday === '' ? null : undefined };
    const user = await prisma.user.update({ where: { id: request.userId! }, data });
    return response.json({ user: presentUser(user) });
  } catch (error) { if (isConflict(error)) return response.status(409).json({ error: 'That username is already in use' }); next(error); }
});

usersRouter.delete('/me', async (request, response, next) => {
  try {
    await prisma.user.delete({ where: { id: request.userId! } });
    clearSession(response);
    response.status(204).end();
  } catch (error) { next(error); }
});

usersRouter.get('/:id', async (request, response, next) => {
  const currentUserId = request.userId!;
  try {
    const [user, friendship, sharedGroups] = await Promise.all([
      prisma.user.findUnique({ where: { id: request.params.id } }),
      prisma.friendship.findFirst({ where: { OR: [{ userOneId: currentUserId, userTwoId: request.params.id }, { userOneId: request.params.id, userTwoId: currentUserId }] } }),
      prisma.group.findMany({
        where: { AND: [
          { memberships: { some: { userId: currentUserId } } },
          { memberships: { some: { userId: request.params.id } } },
        ] },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    if (!user) return response.status(404).json({ error: 'User not found' });
    return response.json({ user: { ...presentUser(user), isFriend: Boolean(friendship), sharedGroups } });
  } catch (error) { next(error); }
});
