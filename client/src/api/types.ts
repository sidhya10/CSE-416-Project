export type AppUser = {
  id: string; email: string; username: string; name: string; phone: string | null;
  birthday: string; bio: string; photoUrl: string | null; hasPassword: boolean;
  hasGoogle: boolean; createdAt: string;
};

export type FriendUser = AppUser & { isFriend: boolean; sharedGroups?: { id: string; name: string }[] };
