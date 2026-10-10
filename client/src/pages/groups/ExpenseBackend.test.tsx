import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import App from '../../App';
import type { ApiGroup, AppUser } from '../../api/types';
import type { ApiExpense } from '../../api/expenses.api';

const owner: AppUser = { id: 'owner-id', email: 'owner@example.com', username: 'owner', name: 'Owner', phone: null, birthday: '', bio: '', photoUrl: null, hasPassword: true, hasGoogle: false, createdAt: '2026-10-09T00:00:00Z' };
const friend = { ...owner, id: 'friend-id', name: 'Friend', username: 'friend' };
const group: ApiGroup = { id: 'group-id', name: 'Saved Team', description: '', type: 'General', color: 'green', photoUrl: null, startDate: '', endDate: '', createdById: owner.id, createdBy: owner, currentUserRole: 'OWNER', members: [{ ...owner, role: 'OWNER', joinedAt: owner.createdAt }, { ...friend, role: 'MEMBER', joinedAt: owner.createdAt }], invitations: [], createdAt: owner.createdAt, updatedAt: owner.createdAt };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
afterEach(() => vi.unstubAllGlobals());

it('retries a failed save with real user IDs and the same request key, then reloads saved data', async () => {
  let saved: ApiExpense | undefined;
  const submitted: { clientRequestId: string; expense: { participantIds: string[]; paidByUserId: string } }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/friends')) return response({ friends: [] });
    if (url.endsWith('/groups')) return response({ groups: [group] });
    if (url.endsWith('/groups/group-id/expenses') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      submitted.push(body);
      if (submitted.length === 1) return response({ error: 'Temporary save failure. Try again.' }, 503);
      saved = { id: 'saved-id', version: 1, title: body.expense.title, expenseDate: body.expense.expenseDate, createdByUserId: owner.id, creator: owner,
        paidByUserId: owner.id, splitMode: 'EQUAL', totalCents: 1000, taxCents: 0, tipCents: 0, otherCents: 0,
        items: [{ id: 'item-id', name: 'Coffee', quantity: 1, unitPriceCents: 1000, assignments: [] }],
        shares: [owner, friend].map(user => ({ userId: user.id, user, baseCents: 500, totalCents: 500, payments: [] })) };
      return response({ expense: saved }, 201);
    }
    if (url.endsWith('/groups/group-id/expenses')) return response({ expenses: saved ? [saved] : [] });
    throw new Error(`Unexpected request ${url}`);
  }));
  const first = render(<App initialUser={owner} />);
  fireEvent.click(screen.getByRole('button', { name: 'Groups' }));
  fireEvent.click(await screen.findByRole('button', { name: /Saved Team.*members/ }));
  fireEvent.click(screen.getByRole('button', { name: '+ Add expense' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'EXPENSE NAME' }), { target: { value: 'Coffee run' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Item 1 name' }), { target: { value: 'Coffee' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Item 1 amount' }), { target: { value: '10' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue to split' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and split $10.00' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Temporary save failure');
  expect(screen.getByRole('button', { name: 'Confirm and split $10.00' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and split $10.00' }));
  await screen.findByText('Saved to your group. You can return to this expense anytime.');
  expect(submitted[0]?.clientRequestId).toBe(submitted[1]?.clientRequestId);
  expect(submitted[1]?.expense.participantIds).toEqual(['owner-id', 'friend-id']);
  expect(submitted[1]?.expense.paidByUserId).toBe('owner-id');
  first.unmount();
  render(<App initialUser={owner} />);
  fireEvent.click(screen.getByRole('button', { name: 'Groups' }));
  fireEvent.click(await screen.findByRole('button', { name: /Saved Team.*members/ }));
  fireEvent.click(await screen.findByRole('button', { name: /Coffee run.*10.00/ }));
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Expense details' })).toBeVisible());
  expect(screen.getByRole('button', { name: 'Edit expense' })).toBeEnabled();
  expect(screen.getByText('Paid by You · Created by you')).toBeVisible();
});
