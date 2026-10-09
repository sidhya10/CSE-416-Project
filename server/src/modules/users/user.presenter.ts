import type { User } from '@prisma/client';

export type PublicUser = ReturnType<typeof presentUser>;

export function presentUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
    phone: user.phone,
    birthday: user.birthday?.toISOString().slice(0, 10) ?? '',
    bio: user.bio,
    photoUrl: user.photoUrl,
    hasPassword: Boolean(user.passwordHash),
    hasGoogle: Boolean(user.googleSubject),
    createdAt: user.createdAt.toISOString(),
  };
}
