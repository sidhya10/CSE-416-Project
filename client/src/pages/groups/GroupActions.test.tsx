import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import GroupsWorkspace, { type FriendFixture, type GroupFixture } from './GroupsWorkspace';
import type { AppUser, ApiGroup } from '../../api/types';
const user: AppUser = { id: 'owner', name: 'Owner', username: 'owner', email: 'owner@example.com', phone: null, birthday: '', bio: '', photoUrl: null, hasGoogle: false, hasPassword: true, createdAt: '2026-01-01' };
const friend: FriendFixture = { ...user, id: 'friend', name: 'Friend', username: 'friend', isFriend: true, handle: '@friend', color: 'green' };
const group: GroupFixture = { id: 'trip', name: 'Trip', type: 'Trip', description: '', members: ['friend'], photo: null, color: 'gold', startDate: '2026-10-01', endDate: '2026-10-02', balance: 0, privateBudget: null, bills: [], plans: [{ id: 1, title: 'Museum', amount: 20 }] };
const renderGroup = (input = group) => render(<GroupsWorkspace currentUser={user} onRootChange={() => {}} initialFriendsData={[friend]} initialGroupsData={[input]} />);
it('confirms permanent group deletion from the sliding actions and supports cancel', async () => {
  renderGroup();
  fireEvent.click(screen.getByRole('button', { name: 'Group actions' }));
  expect(screen.getByRole('button', { name: 'Archive' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  const dialog = screen.getByRole('dialog', { name: 'Delete group permanently?' });
  expect(dialog).toHaveTextContent('cannot be recovered');
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('group', { name: 'Trip' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
  await waitFor(() => expect(screen.queryByRole('group', { name: 'Trip' })).not.toBeInTheDocument());
});
it('removes trip private budgets and allows removing planned expenses', () => {
  renderGroup();
  fireEvent.click(screen.getByRole('button', { name: /Trip.*members/ }));
  expect(screen.queryByText('Your private trip budget')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Delete planned expense Museum' }));
  expect(screen.queryByText('Museum')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Group settings' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete group permanently' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
it('blocks archive with unresolved splits even when net balance is zero', () => {
  renderGroup({ ...group, balance: 0, hasUnresolved: true, canArchive: false });
  fireEvent.click(screen.getByRole('button', { name: 'Group actions' }));
  expect(screen.getByRole('button', { name: 'Archive' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Group actions' }));
  fireEvent.click(screen.getByRole('button', { name: /Trip.*members/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Group settings' }));
  expect(screen.getByRole('button', { name: 'Archive group' })).toBeDisabled();
  expect(screen.getByText(/Resolve all splits and confirm/)).toBeInTheDocument();
});
it('confirms recurring deletion and removes cycle controls', async () => {
  renderGroup({ ...group, type: 'Recurring', bills: [{ id: 'bill', title: 'Rent', amount: 100, startDate: '2030-01-01', frequency: 'Monthly', customEvery: 1, customUnit: 'months', defaultPlan: { payerId: 'you', shares: { you: 5000, friend: 5000 } }, cycles: {} }] });
  fireEvent.click(screen.getByRole('button', { name: /Trip.*members/ }));
  expect(screen.getByRole('heading', { name: 'Past expenses' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Rent.*Monthly/ }));
  expect(screen.queryByText(/Cycle of/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Use plan as|Pause|Resume/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Delete recurring expense' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Past expenses and their payments will remain unchanged');
  fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: /Rent.*Monthly/ })).not.toBeInTheDocument());
});
it('keeps a group and its dialog on a failed delete, then retries through the API', async () => {
  const stored: ApiGroup = { ...user, id: 'api-group', name: 'API group', description: '', type: 'General', color: 'green', photoUrl: null, startDate: '', endDate: '', createdById: user.id, createdBy: user, currentUserRole: 'OWNER', members: [{ ...user, role: 'OWNER', joinedAt: '' }], invitations: [], createdAt: '', updatedAt: '' };
  let removed = false, attempts = 0;
  const response = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status });
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === 'DELETE') { attempts++; if (attempts === 1) return response({ error: 'Try again' }, 500); removed = true; return response(null, 204); }
    if (url.endsWith('/friends')) return response({ friends: [] });
    if (url.endsWith('/expenses')) return response({ expenses: [] });
    if (url.endsWith('/groups')) return response({ groups: removed ? [] : [stored] });
    return response({ group: stored });
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<GroupsWorkspace currentUser={user} onRootChange={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Group actions' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Try again');
  expect(screen.getByRole('group', { name: 'API group' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/groups/api-group'), expect.objectContaining({ method: 'DELETE' }));
});
