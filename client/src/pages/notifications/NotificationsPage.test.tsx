import { afterEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { settlementsApi } from '../../api/settlements.api';
import NotificationsPage from './NotificationsPage';
afterEach(() => vi.restoreAllMocks());
it('keeps notices unread until requested and retains read history', async () => {
  const notice = { groupId: 'g1', id: 'n1', message: 'Eva confirmed your payment.', kind: 'CONFIRMED', createdAt: '2026-10-26T12:00:00Z', readAt: null };
  const load = vi.spyOn(settlementsApi, 'notifications').mockResolvedValue({ notices: [notice] });
  const dismiss = vi.spyOn(settlementsApi, 'dismiss').mockResolvedValue(undefined);
  const back = vi.fn();
  render(<NotificationsPage active onBack={back} />);
  expect(await screen.findByText(notice.message)).toBeVisible();
  expect(dismiss).not.toHaveBeenCalled();
  load.mockResolvedValue({ notices: [{ ...notice, readAt: '2026-10-26T13:00:00Z' }] });
  fireEvent.click(screen.getByRole('button', { name: 'Mark as read' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Mark as read' })).not.toBeInTheDocument());
  expect(dismiss).toHaveBeenCalledWith('n1');
  expect(screen.getByText(notice.message)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Back to Home' }));
  expect(back).toHaveBeenCalledOnce();
});
it('shows an empty state', async () => {
  vi.spyOn(settlementsApi, 'notifications').mockResolvedValue({ notices: [] });
  render(<NotificationsPage active onBack={() => {}} />);
  expect(await screen.findByText('You’re all caught up')).toBeVisible();
});

it('opens the group from a split notice and marks it read', async () => {
  vi.spyOn(settlementsApi, 'notifications').mockResolvedValue({ notices: [{ id: 'split', groupId: 'g1', kind: 'SPLIT_CREATED', message: 'You owe $30.00.', createdAt: '2026-10-26T12:00:00Z', readAt: null }] });
  const dismiss = vi.spyOn(settlementsApi, 'dismiss').mockResolvedValue(undefined);
  const open = vi.fn();
  render(<NotificationsPage active onBack={() => {}} onOpenGroup={open} />);
  const link = await screen.findByRole('button', { name: /You owe.*View group/ });
  await act(async () => { fireEvent.click(link); });
  expect(open).toHaveBeenCalledWith('g1');
  expect(dismiss).toHaveBeenCalledWith('split');
});

it.each([
  ['PAYMENT_SENT', 'Confirm payment received', 'Jordan reported sending you $30.00. Please confirm once received.'],
  ['CONFIRMED', 'Payment confirmed', 'Alex confirmed receiving $30.00.'],
])('opens the relevant group for %s notifications', async (kind, title, message) => {
  vi.spyOn(settlementsApi, 'notifications').mockResolvedValue({ notices: [{ id: 'payment', groupId: 'group-payment', kind, message, createdAt: '2026-10-26T12:00:00Z', readAt: null }] });
  const dismiss = vi.spyOn(settlementsApi, 'dismiss').mockResolvedValue(undefined);
  const open = vi.fn();
  render(<NotificationsPage active onBack={() => {}} onOpenGroup={open} />);
  expect(await screen.findByText(title)).toBeVisible();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /View group/ })); });
  expect(open).toHaveBeenCalledWith('group-payment');
  expect(dismiss).toHaveBeenCalledWith('payment');
});

it('shows over-budget alerts as informational notifications without a group task', async () => {
  vi.spyOn(settlementsApi, 'notifications').mockResolvedValue({ notices: [{ id: 'budget', groupId: null, kind: 'CATEGORY_OVER_BUDGET', message: 'Dining is $5.00 over your October budget.', createdAt: '2026-10-29T12:00:00Z', readAt: null }] });
  render(<NotificationsPage active onBack={() => {}} onOpenGroup={vi.fn()} />);
  expect(await screen.findByText('Category budget exceeded')).toBeInTheDocument();
  expect(screen.getByText('Dining is $5.00 over your October budget.')).toBeInTheDocument();
  expect(screen.queryByText('View group →')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Mark as read' })).toBeInTheDocument();
});
