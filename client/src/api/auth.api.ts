import { apiRequest } from './client';
import type { AppUser } from './types';

type UserResponse = { user: AppUser };

export const authApi = {
  me: () => apiRequest<UserResponse>('/auth/me'),
  login: (email: string, password: string) => apiRequest<UserResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (input: { name: string; username: string; email: string; phone?: string; password: string }) => apiRequest<UserResponse>('/auth/register', { method: 'POST', body: JSON.stringify(input) }),
  googleStart: (nonce: string, intent: 'signin' | 'link') => apiRequest<{ clientId: string; nonce: string; state: string }>('/auth/google/start', { method: 'POST', body: JSON.stringify({ nonce, intent }) }),
  linkGoogle: (credential: string, state: string) => apiRequest<UserResponse>('/auth/google/link', { method: 'POST', body: JSON.stringify({ credential, state }) }),
  google: (credential: string, state: string) => apiRequest<UserResponse>('/auth/google', { method: 'POST', body: JSON.stringify({ credential, state }) }),
  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) => apiRequest<void>('/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword, confirmPassword }) }),
  logout: () => apiRequest<void>('/auth/logout', { method: 'POST' }),
};
