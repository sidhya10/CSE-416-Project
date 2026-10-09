import { Prisma } from '@prisma/client';
import { presentUser } from '../users/user.presenter.js';

export const groupInclude = {
  createdBy: true,
  memberships: { include: { user: true }, orderBy: { joinedAt: 'asc' as const } },
  invitations: {
    include: { invitedUser: true, invitedBy: true },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.GroupInclude;

export type GroupWithRelations = Prisma.GroupGetPayload<{ include: typeof groupInclude }>;

export function presentGroup(group: GroupWithRelations, currentUserId: string) {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    type: group.type,
    color: group.color,
    photoUrl: group.photoUrl,
    startDate: group.startDate?.toISOString().slice(0, 10) ?? '',
    endDate: group.endDate?.toISOString().slice(0, 10) ?? '',
    createdById: group.createdById,
    createdBy: presentUser(group.createdBy),
    currentUserRole: group.memberships.find(membership => membership.userId === currentUserId)?.role ?? null,
    members: group.memberships.map(membership => ({
      ...presentUser(membership.user),
      role: membership.role,
      joinedAt: membership.joinedAt.toISOString(),
    })),
    invitations: group.invitations.map(invitation => ({
      id: invitation.id,
      invitedUser: presentUser(invitation.invitedUser),
      invitedBy: presentUser(invitation.invitedBy),
      role: invitation.role,
      status: invitation.status,
      createdAt: invitation.createdAt.toISOString(),
      acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
    })),
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  };
}
