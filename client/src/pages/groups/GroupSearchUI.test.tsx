import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GroupsWorkspace from './GroupsWorkspace';
import type { AppUser } from '../../api/types';
const currentUser: AppUser = { id: 'owner', email: 'owner@example.com', username: 'owner', name: 'Owner', phone: null, birthday: '', bio: '', photoUrl: null, hasPassword: true, hasGoogle: false, createdAt: '2026-01-01' };
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
describe('group and friend filter controls', () => {
  it('filters groups by friend and status and keeps the archive button at the bottom', () => {
    render(<GroupsWorkspace currentUser={currentUser} onRootChange={() => {}} initialFriendsData={[{ ...currentUser, id: 'alex', name: 'Alex', username: 'alex', isFriend: true, handle: '@alex', color: 'green' }]} initialGroupsData={[
      { id: 'one', name: 'Apartment', description: 'Bills', type: 'General', members: ['alex'], color: 'green', photo: null, startDate: '', endDate: '', balance: -30, amountOwesCents: 3000, hasUnresolved: true, privateBudget: null, plans: [], bills: [] },
      { id: 'two', name: 'Solo', description: '', type: 'General', members: [], color: 'gold', photo: null, startDate: '', endDate: '', balance: 0, privateBudget: null, plans: [], bills: [] },
    ]} />);
    fireEvent.click(screen.getByText('Filter and sort groups'));
    fireEvent.change(screen.getByLabelText('With friend'), { target: { value: 'alex' } });
    expect(screen.getByRole('group', { name: 'Apartment' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Solo' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Payment status'), { target: { value: 'settled' } });
    expect(screen.getByText('No matching groups.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    fireEvent.change(screen.getByLabelText('Search groups'), { target: { value: 'Apartment' } });
    expect(screen.queryByRole('group', { name: 'Solo' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Archived groups (0)' }));
    expect(screen.getByRole('heading', { name: 'Archived groups' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });
  it('sends automatic searches for names, usernames, emails and phones and sorting without a field selector', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ users: [] })));
    render(<GroupsWorkspace currentUser={currentUser} onRootChange={() => {}} initialFriendsData={[]} initialGroupsData={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /find friends/i }));
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByText(/People are not shown until/)).toBeInTheDocument();
    for (const query of ['Alex Morgan', '@alex', 'alex@example.com', '+1 (212) 555-1234']) {
      fireEvent.change(screen.getByLabelText('Search friends'), { target: { value: query } });
      await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`query=${encodeURIComponent(query)}&field=all&sort=name`), expect.anything()));
    }
    expect(screen.queryByLabelText('Search field')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Sort people by'), { target: { value: 'username' } });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('&field=all&sort=username'), expect.anything()));
  });
});
