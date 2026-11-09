import { hasOpenSplits } from './settlement.js';
import { presentBill } from '../recurring/recurring.service.js';
import { Prisma } from '@prisma/client';
import { groupUserSelect, presentUser } from '../users/user.presenter.js';

export const groupInclude = {
  createdBy: { select: groupUserSelect },
  recurringBills: { include: { cycles: true } },
  expenses: { select: { paidByUserId: true, shares: { select: { userId: true, totalCents: true, payments: { where: { status: 'CONFIRMED' }, select: { status: true, amountCents: true } } } } } },
  memberships: { include: { user: { select: groupUserSelect } }, orderBy: { joinedAt: 'asc' as const } },
  invitations: {
    include: { invitedUser: { select: groupUserSelect }, invitedBy: { select: groupUserSelect } },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.GroupInclude;

export type GroupWithRelations = Omit<Prisma.GroupGetPayload<{ include: typeof groupInclude }>, 'photoUrl'> & { photoUrl?: string | null };

export function presentGroup(group: GroupWithRelations, currentUserId: string) {
  let amountOwesCents = 0, amountOwedCents = 0;
  for (const expense of group.expenses) for (const share of expense.shares) {
    if (share.userId === expense.paidByUserId) continue;
    const remaining = share.totalCents - share.payments.filter(payment => payment.status === 'CONFIRMED').reduce((sum, payment) => sum + payment.amountCents, 0);
    if (expense.paidByUserId === currentUserId) amountOwedCents += remaining;
    else if (share.userId === currentUserId) amountOwesCents += remaining;
  }
  return {
    canArchive: !hasOpenSplits(group.expenses),
    archivedAt: group.archivedAt?.toISOString() ?? null, archiveReason: group.archiveReason,
    inactivityDays: group.inactivityDays, lastActivityAt: group.lastActivityAt.toISOString(),
    lastAccessedAt: group.memberships.find(member => member.userId === currentUserId)?.lastAccessedAt?.toISOString() ?? null,
    amountOwesCents, amountOwedCents, hasUnresolved: amountOwesCents > 0 || amountOwedCents > 0,
    recurringBills: group.recurringBills.map(presentBill),
    id: group.id,
    name: group.name,
    description: group.description,
    type: group.type,
    color: group.color,
    photoUrl: group.photoUrl === undefined ? `/api/groups/${group.id}/photo?v=${group.updatedAt.getTime()}` : group.photoUrl,
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
