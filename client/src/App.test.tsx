import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { AppUser } from './api/types';

const account: AppUser = {
  id: 'current', email: 'owner@example.com', username: 'owner', name: 'Account Owner', phone: '+1 555 0100',
  birthday: '1998-04-10', bio: 'Saving for the future', photoUrl: null, hasPassword: true, hasGoogle: false,
  createdAt: '2026-10-09T00:00:00.000Z',
};
const friend = { ...account, id: 'friend-1', email: 'friend@example.com', username: 'friend', name: 'Existing Friend', phone: '+1 555 0101', isFriend: true };
const stranger = { ...account, id: 'user-2', email: 'person@example.com', username: 'newperson', name: 'New Person', phone: null, isFriend: false };

const response = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

describe('App account integration', () => {
  let authenticated = true;
  beforeEach(() => {
    authenticated = true;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return authenticated ? response({ user: account }) : response({ error: 'Authentication required' }, 401);
      if (url.endsWith('/auth/register')) { authenticated = true; return response({ user: account }, 201); }
      if (url.endsWith('/auth/login')) return response({ user: account });
      if (url.endsWith('/auth/logout') || (url.endsWith('/users/me') && init?.method === 'DELETE')) return response(null, 204);
      if (url.endsWith('/users/me') && init?.method === 'PATCH') return response({ user: { ...account, ...JSON.parse(String(init.body)) } });
      if (url.includes('/users?query=')) return response({ users: [friend, stranger] });
      if (url.endsWith('/users/friend-1')) return response({ user: { ...friend, sharedGroups: [] } });
      if (url.endsWith('/friends')) return response({ friends: [friend] });
      if (url.endsWith('/friends/user-2')) return response({ friend: { ...stranger, isFriend: true } }, 201);
      return response({ error: 'Not found' }, 404);
    }));
  });

  it('registers with email and enters the authenticated app', async () => {
    authenticated = false;
    render(<App />);
    await screen.findByRole('heading', { name: 'Welcome back' });
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'NAME' }), { target: { value: 'Account Owner' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'USERNAME' }), { target: { value: 'owner' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'EMAIL' }), { target: { value: 'owner@example.com' } });
    fireEvent.change(screen.getByLabelText('PASSWORD'), { target: { value: 'password1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('heading', { name: 'Good morning, there' })).toBeInTheDocument();
  });

  it('shows backend profile data and persists editable fields', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: 'Good morning, there' });
    fireEvent.click(screen.getByRole('button', { name: 'Profile' }));
    expect(screen.getByText('Account Owner')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^edit profile\s*›$/i }));
    fireEvent.change(screen.getByRole('textbox', { name: 'NAME' }), { target: { value: 'Updated Name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Updated Name')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /account settings/i }));
    expect(screen.getByText('owner@example.com')).toBeInTheDocument();
    expect(screen.getByText('+1 555 0100')).toBeInTheDocument();
  });

  it('loads all accounts, keeps friends visible by default, and opens friend details', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: 'Good morning, there' });
    fireEvent.click(screen.getByRole('button', { name: 'Groups' }));
    fireEvent.click(screen.getByRole('button', { name: /find friends/i }));
    const existing = await screen.findByText('Existing Friend');
    expect(existing).toBeInTheDocument();
    expect(screen.getByText('New Person')).toBeInTheDocument();
    fireEvent.click(existing.closest('button')!);
    expect(await screen.findByRole('heading', { name: 'Friend profile' })).toBeInTheDocument();
    expect(screen.getByText('friend@example.com')).toBeInTheDocument();
    expect(screen.getByText('+1 555 0101')).toBeInTheDocument();
  });

  it('starts groups empty instead of rendering placeholder records', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: 'Good morning, there' });
    fireEvent.click(screen.getByRole('button', { name: 'Groups' }));
    expect(within(screen.getByLabelText('Balance overview')).getAllByText('$0.00')).toHaveLength(2);
    expect(screen.queryAllByRole('group')).toHaveLength(0);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/friends'), expect.objectContaining({ credentials: 'include' })));
  });
});
