import { apiRequest } from './client';
import type { ApiGroup, GroupRole } from './types';

type GroupResponse = { group: ApiGroup };

export const groupsApi = {
  remove: (groupId: string) => apiRequest<void>(`/groups/${groupId}`, { method: 'DELETE' }),
  list: () => apiRequest<{ groups: ApiGroup[] }>('/groups'),
  get: (groupId: string) => apiRequest<GroupResponse>(`/groups/${groupId}`),
  create: (input: {
    name: string; description: string; type: ApiGroup['type']; color: string; photoUrl?: string | null;
    startDate?: string; endDate?: string; memberIds: string[];
  }) => apiRequest<GroupResponse>('/groups', { method: 'POST', body: JSON.stringify(input) }),
  update: (groupId: string, input: Partial<Pick<ApiGroup, 'inactivityDays' | 'name' | 'description' | 'type' | 'color' | 'photoUrl' | 'startDate' | 'endDate'>>) =>
    apiRequest<GroupResponse>(`/groups/${groupId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  invite: (groupId: string, userIds: string[], role: Exclude<GroupRole, 'OWNER'> = 'MEMBER') =>
    apiRequest<GroupResponse>(`/groups/${groupId}/invitations`, { method: 'POST', body: JSON.stringify({ userIds, role }) }),
  removeMember: (groupId: string, userId: string) => apiRequest<void>(`/groups/${groupId}/members/${userId}`, { method: 'DELETE' }),
  archive: (groupId: string, archived: boolean) => apiRequest<GroupResponse>(`/groups/${groupId}/archive`, { method: 'POST', body: JSON.stringify({ archived }) }),
};
