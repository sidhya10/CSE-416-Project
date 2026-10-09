import { apiRequest } from './client';
import type { FriendUser } from './types';

export const friendsApi = {
  list: () => apiRequest<{ friends: FriendUser[] }>('/friends'),
  add: (userId: string) => apiRequest<{ friend: FriendUser }>(`/friends/${encodeURIComponent(userId)}`, { method: 'POST' }),
  remove: (userId: string) => apiRequest<void>(`/friends/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
};
