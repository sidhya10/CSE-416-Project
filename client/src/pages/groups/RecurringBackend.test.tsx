import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import GroupsWorkspace from './GroupsWorkspace';
import type { ApiGroup, AppUser } from '../../api/types';
const user: AppUser = { id: 'owner', name: 'Owner', username: 'owner', email: 'owner@example.com', phone: null, birthday: '', bio: '', photoUrl: null, hasPassword: true, hasGoogle: false, createdAt: '2026-01-01' };
it('saves a recurring schedule with real payer IDs, reloads it and updates the upcoming payment plan', async () => {
  let group: ApiGroup = { id: 'home', name: 'Home', description: '', type: 'Recurring', color: 'green', photoUrl: null, startDate: '', endDate: '', createdById: user.id, createdBy: user, currentUserRole: 'OWNER', members: [{ ...user, role: 'OWNER', joinedAt: '2026-01-01' }], invitations: [], createdAt: '2026-01-01', updatedAt: '2026-01-01', recurringBills: [] };
  const response = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/friends')) return response({ friends: [] });
    if (url.endsWith('/groups')) return response({ groups: [group] });
    if (url.endsWith('/groups/home')) return response({ group });
    if (url.endsWith('/expenses')) return response({ expenses: [] });
    if (url.endsWith('/groups/home/recurring') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      group = { ...group, recurringBills: [{ ...body, id: 'bill-1', intervalEvery: body.customEvery, intervalUnit: body.customUnit, cycles: [], paused: false, error: null, nextDate: body.startDate }] };
      return response({ bill: group.recurringBills![0] }, 201);
    }
    if (url.endsWith('/recurring/bill-1')) return response(null, 204);
    return response({ error: 'Not found' }, 404);
  }));
  render(<GroupsWorkspace currentUser={user} onRootChange={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: /Home.*members/ }));
  fireEvent.click(await screen.findByRole('button', { name: '+ Add recurring' }));
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Utilities' } });
  fireEvent.change(screen.getByLabelText('Amount per cycle'), { target: { value: '30' } });
  fireEvent.change(screen.getByLabelText('Repeat'), { target: { value: 'Custom' } });
  fireEvent.change(screen.getByLabelText('Every'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'weeks' } });
  fireEvent.change(screen.getByLabelText('Recurring from'), { target: { value: '2030-01-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save recurring cost' }));
  await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/groups/home/recurring'), expect.objectContaining({ method: 'POST', body: expect.stringContaining('"defaultPlan":{"payerId":"owner","shares":{"owner":3000}}') })));
  fireEvent.click(await screen.findByRole('button', { name: /Utilities.*Every 2 weeks/ }));
  expect(screen.getByLabelText('Who pays?')).toHaveValue('you');
  fireEvent.click(screen.getByRole('button', { name: 'Save payment plan' }));
  await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/recurring/bill-1'), expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ defaultPlan: { payerId: 'owner', shares: { owner: 3000 } } }) })));
  expect(await screen.findByText('Payment plan saved for the next and future expenses.')).toBeInTheDocument();
});

it('repairs a paused schedule without retaining hidden shares for a removed member', async () => {
  const bill = { id: 'bill-repair', title: 'Rent', amountCents: 3000, startDate: '2030-01-01', frequency: 'Monthly' as const, intervalEvery: 1, intervalUnit: 'months' as const, defaultPlan: { payerId: 'removed', shares: { removed: 3000, owner: 0 } }, cycles: [], paused: true, error: 'Update the default payer and shares.', nextDate: '2030-01-01' };
  const group: ApiGroup = { id: 'repair-home', name: 'Repair home', description: '', type: 'Recurring', color: 'green', photoUrl: null, startDate: '', endDate: '', createdById: user.id, createdBy: user, currentUserRole: 'OWNER', members: [{ ...user, role: 'OWNER', joinedAt: '2026-01-01' }], invitations: [], createdAt: '2026-01-01', updatedAt: '2026-01-01', recurringBills: [bill] };
  const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/friends')) return response({ friends: [] });
    if (url.endsWith('/groups')) return response({ groups: [group] });
    if (url.endsWith('/groups/repair-home')) return response({ group });
    if (url.endsWith('/expenses')) return response({ expenses: [] });
    return response({ bill });
  }));
  render(<GroupsWorkspace currentUser={user} onRootChange={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: /Repair home.*members/ }));
  fireEvent.click(await screen.findByRole('button', { name: /Rent.*Monthly/ }));
  fireEvent.change(screen.getByLabelText('You'), { target: { value: '30' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save payment plan' }));
  await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/recurring/bill-repair'), expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ defaultPlan: { payerId: 'owner', shares: { owner: 3000 } } }) })));
});
