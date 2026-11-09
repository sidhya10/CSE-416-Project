import type { User } from '@prisma/client';

export type PublicUser = ReturnType<typeof presentUser>;

export const groupUserSelect = {
  id: true, email: true, username: true, name: true, phone: true, birthday: true, bio: true,
  passwordHash: true, googleSubject: true, createdAt: true, updatedAt: true,
} as const;
type PresentedUser = Omit<User, 'photoUrl' | 'sessionVersion'> & { photoUrl?: string | null };
export function presentUser(user: PresentedUser) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
    phone: user.phone,
    birthday: user.birthday?.toISOString().slice(0, 10) ?? '',
    bio: user.bio,
    photoUrl: user.photoUrl === undefined ? `/api/users/${user.id}/photo?v=${user.updatedAt.getTime()}` : user.photoUrl,
    hasPassword: Boolean(user.passwordHash),
    hasGoogle: Boolean(user.googleSubject),
    createdAt: user.createdAt.toISOString(),
  };
}
