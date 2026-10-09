export type AppUser = {
  id: string; email: string; username: string; name: string; phone: string | null;
  birthday: string; bio: string; photoUrl: string | null; hasPassword: boolean;
  hasGoogle: boolean; createdAt: string;
};

export type FriendUser = AppUser & { isFriend: boolean; sharedGroups?: { id: string; name: string }[] };

export type GroupRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export type GroupMember = AppUser & { role: GroupRole; joinedAt: string };
export type GroupInvitation = {
  id: string; invitedUser: AppUser; invitedBy: AppUser; role: GroupRole;
  status: 'ACCEPTED' | 'REVOKED'; createdAt: string; acceptedAt: string | null;
};
export type ApiGroup = {
  id: string; name: string; description: string; type: 'General' | 'Trip' | 'Recurring'; color: string;
  photoUrl: string | null; startDate: string; endDate: string; createdById: string; createdBy: AppUser;
  currentUserRole: GroupRole; members: GroupMember[]; invitations: GroupInvitation[];
  createdAt: string; updatedAt: string;
};
