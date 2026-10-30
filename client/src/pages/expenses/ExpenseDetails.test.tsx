import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import ExpenseDetails from './ExpenseDetails';
import type { PreviewSplit } from './split';

const split: PreviewSplit = {
  name: 'Dinner', date: '2026-10-09', payerId: 'you', mode: 'items',
  items: [{ id: 1, name: 'Tea', cents: 501, quantity: 2 }, { id: 2, name: 'Cake', cents: 300 }],
  feeCents: 0, totalCents: 801, assignments: { 1: ['amy', 'you'], 2: ['amy'] },
  shares: [{ memberId: 'you', baseCents: 251, totalCents: 251, reimbursementCents: 0 }, { memberId: 'amy', baseCents: 550, totalCents: 550, reimbursementCents: 550 }],
  memberNames: { amy: 'Amy Saved' },
};
function show(value: PreviewSplit) {
  render(<ExpenseDetails expense={{ title: 'Dinner', subtitle: '', amount: '$8.01', split: value }} groupName="Trip" members={[{ id: 'you', name: 'Eva' }, { id: 'amy', name: 'Amy' }, { id: 'other', name: 'Other' }]} onBack={vi.fn()} onEdit={vi.fn()} onPaymentAction={vi.fn()} onPaymentViewChange={vi.fn()} />);
}
it('shows only assigned members with exact item amounts and historical names', () => {
  show(split);
  const tea = within(screen.getByRole('region', { name: 'Contributors for Tea' }));
  expect(tea.getByText('Tea × 2')).toBeInTheDocument();
  expect(tea.queryByRole('status')).not.toBeInTheDocument();
  fireEvent.click(tea.getByRole('button', { name: 'View You’s share of Tea' }));
  expect(tea.getByRole('status')).toHaveTextContent('You · Payer');
  expect(tea.getByRole('status')).toHaveTextContent('$2.51 before fees');
  const amy = tea.getByRole('button', { name: 'View Amy Saved’s share of Tea' });
  fireEvent.click(amy);
  expect(tea.getByRole('status')).toHaveTextContent('Amy Saved');
  expect(tea.getByRole('status')).toHaveTextContent('$2.50 before fees');
  fireEvent.click(amy);
  expect(tea.queryByRole('status')).not.toBeInTheDocument();
  expect(tea.queryByText('Other')).not.toBeInTheDocument();
  const cake = within(screen.getByRole('region', { name: 'Contributors for Cake' }));
  expect(cake.queryByText('You')).not.toBeInTheDocument();
  expect(cake.getAllByRole('button')).toHaveLength(1);
});
it('shows all saved participants for equal splits without inventing per-item rounded shares', () => {
  show({ ...split, mode: 'equal', assignments: {} });
  const cake = within(screen.getByRole('region', { name: 'Contributors for Cake' }));
  expect(cake.getByText('Shared equally by everyone')).toBeInTheDocument();
  expect(cake.getAllByRole('button')).toHaveLength(2);
  expect(cake.queryByText('$1.50')).not.toBeInTheDocument();
});

it('confirms deletion of an unpaid saved expense', async () => {
  const onDelete = vi.fn().mockResolvedValue(undefined);
  render(<ExpenseDetails expense={{ title: 'Dinner', subtitle: '', amount: '$8.01', split: { ...split, expenseId: 'saved', creatorId: 'you', hasPaymentHistory: false } }} groupName="Trip" members={[]} onBack={vi.fn()} onEdit={vi.fn()} onDelete={onDelete} onPaymentAction={vi.fn()} onPaymentViewChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Delete expense' }));
  expect(onDelete).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Delete expense' }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' })); });
  expect(onDelete).toHaveBeenCalledOnce();
});

it('does not offer deletion for expenses with payment history', () => {
  render(<ExpenseDetails expense={{ title: 'Dinner', subtitle: '', amount: '$8.01', split: { ...split, expenseId: 'saved', creatorId: 'you', hasPaymentHistory: true } }} groupName="Trip" members={[]} onBack={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} onPaymentAction={vi.fn()} onPaymentViewChange={vi.fn()} />);
  expect(screen.queryByRole('button', { name: 'Delete expense' })).not.toBeInTheDocument();
});
