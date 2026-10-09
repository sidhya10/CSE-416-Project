import { apiRequest } from './client';
import type { AppUser, FriendUser } from './types';

export const usersApi = {
  updateMe: (input: Pick<AppUser, 'name' | 'username' | 'birthday' | 'bio' | 'photoUrl'>) => apiRequest<{ user: AppUser }>('/users/me', { method: 'PATCH', body: JSON.stringify(input) }),
  deleteMe: () => apiRequest<void>('/users/me', { method: 'DELETE' }),
  search: (query = '') => apiRequest<{ users: FriendUser[] }>(`/users?query=${encodeURIComponent(query)}`),
  get: (id: string) => apiRequest<{ user: FriendUser }>(`/users/${encodeURIComponent(id)}`),
};
