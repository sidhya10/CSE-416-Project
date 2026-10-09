import { Router } from 'express';
import { prisma } from '../../config/database.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { presentUser } from '../users/user.presenter.js';

export const friendsRouter = Router();
friendsRouter.use(requireAuth);

const pair = (left: string, right: string) => left < right ? { userOneId: left, userTwoId: right } : { userOneId: right, userTwoId: left };

friendsRouter.get('/', async (request, response, next) => {
  const userId = request.userId!;
  try {
    const rows = await prisma.friendship.findMany({ where: { OR: [{ userOneId: userId }, { userTwoId: userId }] }, include: { userOne: true, userTwo: true }, orderBy: { createdAt: 'asc' } });
    return response.json({ friends: rows.map(row => ({ ...presentUser(row.userOneId === userId ? row.userTwo : row.userOne), isFriend: true })) });
  } catch (error) { next(error); }
});

friendsRouter.post('/:userId', async (request, response, next) => {
  const currentUserId = request.userId!;
  if (currentUserId === request.params.userId) return response.status(400).json({ error: 'You cannot add yourself as a friend' });
  try {
    const user = await prisma.user.findUnique({ where: { id: request.params.userId } });
    if (!user) return response.status(404).json({ error: 'User not found' });
    await prisma.friendship.upsert({ where: { userOneId_userTwoId: pair(currentUserId, user.id) }, create: pair(currentUserId, user.id), update: {} });
    return response.status(201).json({ friend: { ...presentUser(user), isFriend: true } });
  } catch (error) { next(error); }
});

friendsRouter.delete('/:userId', async (request, response, next) => {
  const currentUserId = request.userId!;
  try {
    await prisma.friendship.deleteMany({ where: pair(currentUserId, request.params.userId) });
    response.status(204).end();
  } catch (error) { next(error); }
});
