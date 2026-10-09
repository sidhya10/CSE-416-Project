import { apiRequest } from './client';
import type { AppUser } from './types';

type UserResponse = { user: AppUser };

export const authApi = {
  me: () => apiRequest<UserResponse>('/auth/me'),
  login: (email: string, password: string) => apiRequest<UserResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (input: { name: string; username: string; email: string; phone?: string; password: string }) => apiRequest<UserResponse>('/auth/register', { method: 'POST', body: JSON.stringify(input) }),
  google: (credential: string) => apiRequest<UserResponse>('/auth/google', { method: 'POST', body: JSON.stringify({ credential }) }),
  logout: () => apiRequest<void>('/auth/logout', { method: 'POST' }),
};
