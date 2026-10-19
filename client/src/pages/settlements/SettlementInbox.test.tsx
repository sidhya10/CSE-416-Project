import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import SettlementInbox from './SettlementInbox';
import SettlementReview from './SettlementReview';
import { settlementsApi, type SettlementBatch, type SettlementInboxData } from '../../api/settlements.api';
const pair = { senderId: 'member', senderName: 'Jordan', recipientId: 'owner', recipientName: 'Alex', amountCents: 3000, confirmedCents: 0, pendingCents: 0, unreportedCents: 3000, pendingPayments: [] };
const batch: SettlementBatch = { id: 'batch', groupId: 'group', groupName: 'Trip', createdAt: '2026-10-18', totalCents: 3000, completed: false, expenses: [{ id: 'expense', title: 'Dinner' }], pairs: [pair] };
const data = (userId = 'member'): SettlementInboxData => ({ userId, batches: [structuredClone(batch)], notices: [] });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('shows send notifications, records the method and preserves an idempotency key on a failed retry', async () => {
  let current = data();
  vi.spyOn(settlementsApi, 'inbox').mockImplementation(async () => structuredClone(current));
  const report = vi.spyOn(settlementsApi, 'reportGroup').mockRejectedValueOnce(new Error('Network failed')).mockImplementationOnce(async () => {
    current = { ...current, batches: [{ ...batch, pairs: [{ ...pair, pendingCents: 3000, unreportedCents: 0, pendingPayments: [{ id: 'payment', cents: 3000, method: 'Zelle' }] }] }] }; return {};
  });
  render(<SettlementInbox />);
  fireEvent.click(await screen.findByRole('button', { name: /Send Alex \$30.00/ }));
  const dialog = screen.getByRole('dialog', { name: 'Confirm money sent' });
  fireEvent.change(within(dialog).getByLabelText('How did you send it?'), { target: { value: 'Zelle' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'I sent $30.00' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Network failed');
  fireEvent.click(within(dialog).getByRole('button', { name: 'I sent $30.00' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(report.mock.calls[0]).toEqual(report.mock.calls[1]);
  expect(report).toHaveBeenCalledWith('group', expect.objectContaining({ recipientId: 'owner', method: 'Zelle', allocations: [{ batchId: 'batch', amountCents: 3000 }] }));
  expect(screen.getByRole('button', { name: /Waiting for Alex to confirm/ })).toBeInTheDocument();
});
it('shows real sent/confirmed progress and lets only the recipient confirm or remind through the collection dialog', async () => {
  const current = data('owner');
  current.batches[0]!.pairs[0] = { ...pair, pendingCents: 1000, unreportedCents: 2000, pendingPayments: [{ id: 'p1', cents: 1000, method: 'Venmo' }] };
  vi.spyOn(settlementsApi, 'inbox').mockResolvedValue(current);
  const confirm = vi.spyOn(settlementsApi, 'confirmGroup').mockResolvedValue({});
  const remind = vi.spyOn(settlementsApi, 'remindGroup').mockResolvedValue(undefined);
  render(<SettlementInbox />);
  expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '1000');
  fireEvent.click(screen.getByRole('button', { name: /Trip · Collect/ }));
  const dialog = screen.getByRole('dialog', { name: 'Collection progress' });
  expect(within(dialog).getByText('$10.00 · Venmo')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm received from Jordan' }));
  await waitFor(() => expect(confirm).toHaveBeenCalledWith('group', { senderId: 'member', allocations: [{ batchId: 'batch', paymentIds: ['p1'] }], status: 'CONFIRMED' }));
  await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Remind Jordan' })).toBeEnabled());
  fireEvent.click(within(dialog).getByRole('button', { name: 'Remind Jordan' }));
  await waitFor(() => expect(remind).toHaveBeenCalledWith('group', 'member'));
});
it('does not fetch hidden notifications and dismisses only the selected notice', async () => {
  const current = { ...data(), batches: [], notices: [{ id: 'notice', batchId: 'batch', message: 'Alex confirmed receiving $30.', kind: 'CONFIRMED', createdAt: '' }] };
  const load = vi.spyOn(settlementsApi, 'inbox').mockResolvedValue(current);
  const dismiss = vi.spyOn(settlementsApi, 'dismiss').mockResolvedValue(undefined);
  const view = render(<SettlementInbox active={false} />);
  expect(load).not.toHaveBeenCalled(); view.rerender(<SettlementInbox active />);
  fireEvent.click(await screen.findByRole('button', { name: /Dismiss Alex confirmed/ }));
  await waitFor(() => expect(dismiss).toHaveBeenCalledWith('notice'));
});
it('does not offer reminders when every debtor has reported sent, and never offers another payment while awaiting confirmation', async () => {
  const current = data('owner');
  current.batches[0]!.pairs[0] = { ...pair, unreportedCents: 0, pendingCents: 3000, pendingPayments: [{ id: 'p', cents: 3000, method: 'Cash' }] };
  vi.spyOn(settlementsApi, 'inbox').mockResolvedValue(current);
  render(<SettlementInbox />);
  fireEvent.click(await screen.findByRole('button', { name: /Trip · Collect/ }));
  expect(screen.queryByRole('button', { name: /Remind Jordan/ })).not.toBeInTheDocument();
});
it('reviews only current outstanding transactions and returns to Groups after initialization succeeds', async () => {
  vi.spyOn(settlementsApi, 'preview').mockResolvedValue({ expenseIds: ['expense'], totalCents: 3000, expenses: [{ id: 'expense', title: 'Dinner', outstandingCents: 3000 }] });
  const save = vi.spyOn(settlementsApi, 'initialize').mockResolvedValue({ batch });
  const done = vi.fn();
  render(<SettlementReview groupId="group" groupName="Trip" onBack={() => {}} onDone={done} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Start split' }));
  await waitFor(() => expect(done).toHaveBeenCalledOnce());
  expect(save).toHaveBeenCalledWith('group', expect.objectContaining({ expenseIds: ['expense'], totalCents: 3000 }));
});
it('keeps the review open when a stale preview is rejected and offers a refresh', async () => {
  vi.spyOn(settlementsApi, 'preview').mockResolvedValue({ expenseIds: ['expense'], totalCents: 3000, expenses: [{ id: 'expense', title: 'Dinner', outstandingCents: 3000 }] });
  vi.spyOn(settlementsApi, 'initialize').mockRejectedValue(new Error('Transactions changed'));
  const done = vi.fn();
  render(<SettlementReview groupId="group" groupName="Trip" onBack={() => {}} onDone={done} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Start split' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Transactions changed');
  expect(done).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Review updated transactions' })).toBeInTheDocument();
});

it('combines multiple open periods into one outgoing and one collection card per group', async () => {
  const current = data();
  current.batches.push({ ...structuredClone(batch), id: 'batch2', expenses: [{ id: 'expense2', title: 'Taxi' }], pairs: [{ ...pair, amountCents: 1000, unreportedCents: 1000 }, { ...pair, senderId: 'owner', senderName: 'Alex', recipientId: 'member', recipientName: 'Jordan', amountCents: 1800, unreportedCents: 1800 }] });
  const paidHistory = { ...structuredClone(batch), id: 'paid', completed: true, pairs: [{ ...pair, confirmedCents: 3000, unreportedCents: 0 }] };
  current.batches.push(paidHistory);
  vi.spyOn(settlementsApi, 'inbox').mockResolvedValue(current);
  const report = vi.spyOn(settlementsApi, 'reportGroup').mockResolvedValue({});
  render(<SettlementInbox />);
  expect(await screen.findByRole('button', { name: /Send Alex \$40.00/ })).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /Send Alex/ })).toHaveLength(1);
  expect(screen.getAllByRole('button', { name: /Trip · Collect \$18.00/ })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: /Send Alex/ }));
  fireEvent.click(screen.getByRole('button', { name: 'I sent $40.00' }));
  await waitFor(() => expect(report).toHaveBeenCalledWith('group', expect.objectContaining({ allocations: [{ batchId: 'batch', amountCents: 3000 }, { batchId: 'batch2', amountCents: 1000 }] })));
});
it('keeps multiple recipients in one group card and counts each debtor only once in collection progress', async () => {
  const current = data('owner');
  current.batches.push({ ...structuredClone(batch), id: 'batch2' });
  current.batches[0]!.pairs.push({ ...pair, senderId: 'owner', recipientId: 'a', recipientName: 'Taylor' }, { ...pair, senderId: 'owner', recipientId: 'b', recipientName: 'Casey' });
  vi.spyOn(settlementsApi, 'inbox').mockResolvedValue(current);
  render(<SettlementInbox />);
  expect(await screen.findByRole('button', { name: /Send \$60.00 to 2 people/ })).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /Trip · Collect/ })).toHaveLength(1);
  expect(screen.getByText('0 of 1 people reported sent · 0 confirmed received')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '6000');
});
it('blocks a stale payment popup when a new split changes its allocations', async () => {
  let current = data();
  vi.spyOn(settlementsApi, 'inbox').mockImplementation(async () => structuredClone(current));
  const report = vi.spyOn(settlementsApi, 'reportGroup').mockResolvedValue({});
  render(<SettlementInbox />);
  fireEvent.click(await screen.findByRole('button', { name: /Send Alex/ }));
  current = { ...current, batches: [...current.batches, { ...structuredClone(batch), id: 'new' }] };
  fireEvent(window, new Event('cse416:settlements'));
  expect(await screen.findByRole('alert')).toHaveTextContent('The amount changed');
  expect(screen.getByRole('button', { name: 'I sent $60.00' })).toBeDisabled();
  expect(report).not.toHaveBeenCalled();
});
