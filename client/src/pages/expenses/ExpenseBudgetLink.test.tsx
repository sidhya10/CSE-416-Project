import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { apiRequest } from '../../api/client';
import ExpenseBudgetLink from './ExpenseBudgetLink';
vi.mock('../../api/client', () => ({ apiRequest: vi.fn() }));
afterEach(() => vi.resetAllMocks());
it('lets the payer link a transaction without changing the expense category', async () => {
  vi.mocked(apiRequest).mockResolvedValueOnce({ category: 'other', linked: false, transactionId: null, canLink: true, candidates: [{ id: 'bank', name: 'Dinner', merchant: null, date: '2026-10-28', amountCents: 24000, pending: false }] }).mockResolvedValue(undefined);
  render(<ExpenseBudgetLink expenseId="expense" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Link transaction' }));
  fireEvent.click(screen.getByRole('button', { name: /Dinner/ }));
  expect(screen.getByLabelText('Your budget category')).toBeVisible();
  fireEvent.click(screen.getByText('Save'));
  await waitFor(() => expect(apiRequest).toHaveBeenLastCalledWith('/expenses/expense/budget-link', { method: 'PUT', body: JSON.stringify({ transactionId: 'bank' }) }));
  expect(await screen.findByRole('status')).toHaveTextContent('Bank link saved');
  expect(screen.getByRole('heading', { name: /Bank transaction linked/ })).toBeVisible();
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
});
it('does not show bank linking controls to other members', async () => {
  vi.mocked(apiRequest).mockResolvedValue({ category: 'dining', linked: true, transactionId: null, canLink: false, candidates: [] });
  render(<ExpenseBudgetLink expenseId="expense" />);
  expect(await screen.findByLabelText('Your budget category')).toHaveValue('dining');
  expect(screen.queryByRole('button', { name: 'Link transaction' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Your budget category'), { target: { value: 'groceries' } });
  await waitFor(() => expect(screen.getByLabelText('Your budget category')).toHaveValue('groceries'));
  expect(screen.queryByText('Your category is saved.')).not.toBeInTheDocument();
});

it('shows a different-amount charge and explains its budget impact', async () => {
  vi.mocked(apiRequest).mockResolvedValue({ expenseTotalCents: 24000, category: 'dining', linked: false, transactionId: null, canLink: true, candidates: [{ id: 'different', name: 'Cheesecake', merchant: null, date: '2026-10-28', amountCents: 25000, pending: false }] });
  render(<ExpenseBudgetLink expenseId="expense" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Link transaction' }));
  fireEvent.click(screen.getByRole('button', { name: /Cheesecake/ }));
  expect(screen.getByRole('note')).toHaveTextContent('differs from the receipt total of $240.00');
});
it('explains why no charges are available', async () => {
  vi.mocked(apiRequest).mockResolvedValue({ category: 'other', linked: false, transactionId: null, canLink: true, candidates: [] });
  render(<ExpenseBudgetLink expenseId="expense" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Link transaction' }));
  expect(await screen.findByText(/No available bank charges found/)).toBeVisible();
});

it('hides transactions until requested and clears the selection with No transaction', async () => {
  vi.mocked(apiRequest).mockResolvedValue({ category: 'other', transactionId: null, canLink: true, candidates: [{ id: 'bank', name: 'Dinner', date: '2026-10-28', amountCents: 24000 }] });
  render(<ExpenseBudgetLink expenseId="expense" />);
  fireEvent.click(await screen.findByRole('button', { name: 'No transaction' }));
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Link transaction' }));
  fireEvent.click(screen.getByRole('button', { name: /Dinner/ }));
  fireEvent.click(screen.getByRole('button', { name: 'No transaction' }));
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(apiRequest).toHaveBeenLastCalledWith('/expenses/expense/budget-link', { method: 'PUT', body: JSON.stringify({ transactionId: null }) }));
});

it('filters transactions by merchant, date, and amount', async () => {
  vi.mocked(apiRequest).mockResolvedValue({ category: 'other', transactionId: null, canLink: true, candidates: [
    { id: 'a', name: 'Dinner', date: '2026-10-28', amountCents: 24000 },
    { id: 'b', name: 'Coffee', date: '2026-10-21', amountCents: 500 },
  ] });
  render(<ExpenseBudgetLink expenseId="expense" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Link transaction' }));
  for (const query of ['coffee', '2026-10-21', '5.00']) {
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: query } });
    expect(screen.getByRole('button', { name: /Coffee/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Dinner/ })).not.toBeInTheDocument();
  }
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'nothing' } });
  expect(screen.getByText(/No matching transactions/)).toBeVisible();
});

it('shows a persisted link on return and allows changing it', async () => {
  vi.mocked(apiRequest).mockResolvedValue({ category: 'other', linked: true, transactionId: 'bank', canLink: true, ownShareCents: 12000, candidates: [{ id: 'bank', name: 'Dinner', date: '2026-10-28', amountCents: 24000 }] });
  render(<ExpenseBudgetLink expenseId="expense" />);
  expect(await screen.findByRole('heading', { name: /Bank transaction linked/ })).toBeVisible();
  expect(screen.getByText('Dinner')).toBeVisible();
  expect(screen.getByText(/Your budget counts your \$120.00 share/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Change link' }));
  expect(screen.getByRole('searchbox')).toBeVisible();
});

it('remembers a saved No transaction choice on return', async () => {
  vi.mocked(apiRequest).mockResolvedValue({ reviewed: true, linked: false, category: 'other', transactionId: null, canLink: true, candidates: [] });
  render(<ExpenseBudgetLink expenseId="expense" />);
  expect(await screen.findByRole('heading', { name: /Budget setup complete/ })).toBeVisible();
  expect(screen.getByText('No bank transaction linked')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Link a transaction' }));
  expect(screen.getByRole('searchbox')).toBeVisible();
});

it.each([false, true])('lets a payer change their category after completing budget setup (linked=%s)', async linked => {
  vi.mocked(apiRequest).mockResolvedValueOnce({ reviewed: true, linked, category: 'other', transactionId: linked ? 'bank' : null, canLink: true, candidates: [] }).mockResolvedValue(undefined);
  render(<ExpenseBudgetLink expenseId="expense" />);
  fireEvent.change(await screen.findByLabelText('Your budget category'), { target: { value: 'dining' } });
  await waitFor(() => expect(screen.getByLabelText('Your budget category')).toHaveValue('dining'));
  expect(apiRequest).toHaveBeenLastCalledWith('/expenses/expense/budget-category', { method: 'PUT', body: JSON.stringify({ category: 'dining' }) });
  expect(screen.queryByText('Your category is saved.')).not.toBeInTheDocument();
});
