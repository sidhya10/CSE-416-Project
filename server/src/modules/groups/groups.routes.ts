import { ExpenseError, transaction } from '../expenses/expense.service.js';
import { GroupRole, Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { groupInclude, presentGroup } from './group.presenter.js';

export const groupsRouter = Router();
groupsRouter.use(requireAuth);

const groupType = z.enum(['General', 'Trip', 'Recurring']);
const dateValue = z.iso.date().optional().or(z.literal(''));
const createSchema = z.object({
  name: z.string().trim().min(1).max(70),
  description: z.string().trim().max(180).default(''),
  type: groupType.default('General'),
  color: z.string().trim().min(1).max(30).default('gold'),
  photoUrl: z.string().max(7_000_000).nullable().optional(),
  startDate: dateValue,
  endDate: dateValue,
  memberIds: z.array(z.string().min(1)).max(100).default([]).transform(values => [...new Set(values)]),
}).strict().superRefine((value, context) => {
  if (value.type !== 'Trip') return;
  if (!value.startDate || !value.endDate || value.endDate < value.startDate) {
    context.addIssue({ code: 'custom', message: 'Trip groups require valid start and end dates' });
  }
});
const updateSchema = z.object({
  name: z.string().trim().min(1).max(70).optional(),
  description: z.string().trim().max(180).optional(),
  type: groupType.optional(),
  color: z.string().trim().min(1).max(30).optional(),
  photoUrl: z.string().max(7_000_000).nullable().optional(),
  startDate: dateValue,
  endDate: dateValue,
}).strict().refine(value => Object.keys(value).length > 0, 'Provide at least one field to update');
const invitationSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1).max(100).transform(values => [...new Set(values)]),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
}).strict();

const validationError = (issues: { message: string }[]) => ({ error: 'Invalid request', details: issues.map(issue => issue.message) });
const toDate = (value: string | undefined) => value ? new Date(`${value}T00:00:00.000Z`) : value === '' ? null : undefined;

async function membership(groupId: string, userId: string) {
  return prisma.groupMembership.findUnique({ where: { groupId_userId: { groupId, userId } } });
}

async function groupResponse(groupId: string, currentUserId: string) {
  const group = await prisma.group.findUnique({ where: { id: groupId }, include: groupInclude });
  return group ? presentGroup(group, currentUserId) : null;
}

async function requireMember(groupId: string, userId: string) {
  const member = await membership(groupId, userId);
  return member ?? null;
}

groupsRouter.get('/', async (request, response, next) => {
  try {
    const groups = await prisma.group.findMany({
      where: { memberships: { some: { userId: request.userId! } } },
      include: groupInclude,
      orderBy: { updatedAt: 'desc' },
    });
    response.json({ groups: groups.map(group => presentGroup(group, request.userId!)) });
  } catch (error) { next(error); }
});

groupsRouter.post('/', async (request, response, next) => {
  const parsed = createSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json(validationError(parsed.error.issues));
  const creatorId = request.userId!;
  const memberIds = parsed.data.memberIds.filter(id => id !== creatorId);
  try {
    const foundUsers = await prisma.user.count({ where: { id: { in: memberIds } } });
    if (foundUsers !== memberIds.length) return response.status(400).json({ error: 'One or more invited users do not exist' });
    const group = await prisma.group.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        type: parsed.data.type,
        color: parsed.data.color,
        photoUrl: parsed.data.photoUrl,
        startDate: toDate(parsed.data.startDate),
        endDate: toDate(parsed.data.endDate),
        createdById: creatorId,
        memberships: { create: [
          { userId: creatorId, role: GroupRole.OWNER },
          ...memberIds.map(userId => ({ userId, role: GroupRole.MEMBER })),
        ] },
        invitations: { create: memberIds.map(invitedUserId => ({
          invitedUserId, invitedById: creatorId, role: GroupRole.MEMBER,
          status: 'ACCEPTED', acceptedAt: new Date(),
        })) },
      },
      include: groupInclude,
    });
    return response.status(201).json({ group: presentGroup(group, creatorId) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') return response.status(400).json({ error: 'One or more invited users do not exist' });
    next(error);
  }
});

groupsRouter.get('/:groupId', async (request, response, next) => {
  try {
    if (!(await requireMember(request.params.groupId, request.userId!))) return response.status(404).json({ error: 'Group not found' });
    const group = await groupResponse(request.params.groupId, request.userId!);
    if (!group) return response.status(404).json({ error: 'Group not found' });
    return response.json({ group });
  } catch (error) { next(error); }
});

groupsRouter.patch('/:groupId', async (request, response, next) => {
  const parsed = updateSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json(validationError(parsed.error.issues));
  try {
    const member = await requireMember(request.params.groupId, request.userId!);
    if (!member) return response.status(404).json({ error: 'Group not found' });
    if (member.role === GroupRole.MEMBER) return response.status(403).json({ error: 'Only group owners and admins can update this group' });
    const current = await prisma.group.findUnique({ where: { id: request.params.groupId } });
    if (!current) return response.status(404).json({ error: 'Group not found' });
    const startDate = parsed.data.startDate === undefined ? current.startDate : toDate(parsed.data.startDate);
    const endDate = parsed.data.endDate === undefined ? current.endDate : toDate(parsed.data.endDate);
    const resultingType = parsed.data.type ?? current.type;
    if (resultingType === 'Trip' && (!startDate || !endDate || endDate < startDate)) return response.status(400).json({ error: 'Trip groups require valid start and end dates' });
    await prisma.group.update({ where: { id: current.id }, data: {
      ...parsed.data,
      startDate: toDate(parsed.data.startDate),
      endDate: toDate(parsed.data.endDate),
    } });
    return response.json({ group: await groupResponse(current.id, request.userId!) });
  } catch (error) { next(error); }
});

groupsRouter.delete('/:groupId', async (request, response, next) => {
  try {
    const member = await requireMember(request.params.groupId, request.userId!);
    if (!member) return response.status(404).json({ error: 'Group not found' });
    if (member.role !== GroupRole.OWNER) return response.status(403).json({ error: 'Only the group owner can delete this group' });
    if (await prisma.expense.count({ where: { groupId: request.params.groupId } })) return response.status(409).json({ error: 'Groups with expense history cannot be deleted' });
    await prisma.group.delete({ where: { id: request.params.groupId } });
    return response.status(204).end();
  } catch (error) { next(error); }
});

groupsRouter.post('/:groupId/invitations', async (request, response, next) => {
  const parsed = invitationSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json(validationError(parsed.error.issues));
  try {
    const actor = await requireMember(request.params.groupId, request.userId!);
    if (!actor) return response.status(404).json({ error: 'Group not found' });
    if (actor.role === GroupRole.MEMBER) return response.status(403).json({ error: 'Only group owners and admins can invite members' });
    if (parsed.data.role === 'ADMIN' && actor.role !== GroupRole.OWNER) return response.status(403).json({ error: 'Only the group owner can add an admin' });
    const group = await prisma.group.findUnique({ where: { id: request.params.groupId } });
    if (!group) return response.status(404).json({ error: 'Group not found' });
    const userIds = parsed.data.userIds.filter(id => id !== group.createdById);
    const foundUsers = await prisma.user.count({ where: { id: { in: userIds } } });
    if (foundUsers !== userIds.length) return response.status(400).json({ error: 'One or more invited users do not exist' });
    await prisma.$transaction([
      ...userIds.map(userId => prisma.groupMembership.upsert({
        where: { groupId_userId: { groupId: group.id, userId } },
        create: { groupId: group.id, userId, role: parsed.data.role },
        update: { role: parsed.data.role },
      })),
      ...userIds.map(invitedUserId => prisma.groupInvitation.upsert({
        where: { groupId_invitedUserId: { groupId: group.id, invitedUserId } },
        create: { groupId: group.id, invitedUserId, invitedById: request.userId!, role: parsed.data.role, status: 'ACCEPTED', acceptedAt: new Date() },
        update: { invitedById: request.userId!, role: parsed.data.role, status: 'ACCEPTED', acceptedAt: new Date() },
      })),
      prisma.group.update({ where: { id: group.id }, data: { updatedAt: new Date() } }),
    ]);
    return response.status(201).json({ group: await groupResponse(group.id, request.userId!) });
  } catch (error) { next(error); }
});

groupsRouter.delete('/:groupId/members/:userId', async (request, response, next) => {
  try {
    const actor = await requireMember(request.params.groupId, request.userId!);
    if (!actor) return response.status(404).json({ error: 'Group not found' });
    const target = await membership(request.params.groupId, request.params.userId);
    if (!target) return response.status(404).json({ error: 'Group member not found' });
    if (target.role === GroupRole.OWNER) return response.status(400).json({ error: 'The group owner cannot be removed' });
    const leavingSelf = request.params.userId === request.userId;
    if (!leavingSelf && actor.role === GroupRole.MEMBER) return response.status(403).json({ error: 'Only group owners and admins can remove members' });
    if (!leavingSelf && target.role === GroupRole.ADMIN && actor.role !== GroupRole.OWNER) return response.status(403).json({ error: 'Only the group owner can remove an admin' });
    await transaction(async tx => {
      const expenses = await tx.expense.findMany({ where: { groupId: request.params.groupId }, include: { shares: { include: { payments: true } } } });
      const targetId = request.params.userId;
      for (const expense of expenses) {
        const shares = expense.paidByUserId === targetId ? expense.shares.filter(share => share.userId !== targetId) : expense.shares.filter(share => share.userId === targetId);
        if (shares.some(share => share.totalCents > share.payments.filter(payment => payment.status === 'CONFIRMED').reduce((sum, payment) => sum + payment.amountCents, 0))) {
          throw new ExpenseError(409, 'Settle this member’s expense payments before removing them');
        }
      }
      await tx.groupMembership.delete({ where: { groupId_userId: { groupId: request.params.groupId, userId: targetId } } });
      await tx.groupInvitation.updateMany({ where: { groupId: request.params.groupId, invitedUserId: targetId }, data: { status: 'REVOKED', acceptedAt: null } });
      await tx.group.update({ where: { id: request.params.groupId }, data: { updatedAt: new Date() } });
    });
    return response.status(204).end();
  } catch (error) { next(error); }
});
