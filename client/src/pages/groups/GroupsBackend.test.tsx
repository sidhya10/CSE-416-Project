import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import type { ApiGroup, AppUser, FriendUser } from '../../api/types';

const owner: AppUser = {
  id: 'owner', email: 'owner@example.com', username: 'owner', name: 'Owner', phone: null,
  birthday: '', bio: '', photoUrl: null, hasPassword: true, hasGoogle: true, createdAt: '2026-10-09T00:00:00.000Z',
};
const friend: FriendUser = {
  ...owner, id: 'friend', email: 'friend@example.com', username: 'friend', name: 'Friend', isFriend: true,
};
const response = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

describe('group backend integration', () => {
  beforeEach(() => {
    let groups: ApiGroup[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/expenses')) return response({ expenses: [] });
      if (url.endsWith('/friends')) return response({ friends: [friend] });
      if (url.endsWith('/groups') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        const group: ApiGroup = {
          id: 'group-1', name: body.name, description: body.description, type: body.type, color: body.color,
          photoUrl: body.photoUrl ?? null, startDate: body.startDate ?? '', endDate: body.endDate ?? '',
          createdById: owner.id, createdBy: owner, currentUserRole: 'OWNER',
          members: [
            { ...owner, role: 'OWNER', joinedAt: '2026-10-09T00:00:00.000Z' },
            { ...friend, role: 'MEMBER', joinedAt: '2026-10-09T00:00:00.000Z' },
          ],
          invitations: [], createdAt: '2026-10-09T00:00:00.000Z', updatedAt: '2026-10-09T00:00:00.000Z',
        };
        groups = [group];
        return response({ group }, 201);
      }
      if (url.endsWith('/groups') && !init?.method) return response({ groups });
      if (url.endsWith('/groups/group-1') && init?.method === 'DELETE') { groups = []; return response(null, 204); }
      return response({ error: 'Not found' }, 404);
    }));
  });

  it('creates a persisted group and removes it from the screen immediately after backend deletion', async () => {
    render(<App initialUser={owner} />);
    fireEvent.click(screen.getByRole('button', { name: 'Groups' }));
    await screen.findByRole('button', { name: /new group/i });
    fireEvent.click(screen.getByRole('button', { name: /new group/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Friend.*@friend/i }));
    fireEvent.click(screen.getByRole('button', { name: /next: customize group/i }));
    fireEvent.change(screen.getByRole('textbox', { name: 'GROUP NAME' }), { target: { value: 'Persistent Team' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create group' }));
    expect(await screen.findByRole('heading', { name: 'Persistent Team' })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/groups'), expect.objectContaining({ method: 'POST' }));

    fireEvent.click(screen.getByRole('button', { name: 'Group settings' }));
    expect(screen.getByText('Created by you')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete group' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Groups' })).toBeInTheDocument());
    expect(screen.queryByText('Persistent Team')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/groups/group-1'), expect.objectContaining({ method: 'DELETE' }));
  });
});
