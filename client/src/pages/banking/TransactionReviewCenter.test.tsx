import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import TransactionReviewCenter from './TransactionReviewCenter';

const transaction = {
  id: 'tx-1', accountId: 'account-1', accountName: 'Checking', institution: 'Test Bank', merchant: 'Corner Cafe', name: 'CORNER CAFE',
  date: '2026-10-29', amountCents: 1250, pending: false, providerCategory: 'FOOD_AND_DRINK', category: 'dining',
  excluded: false, note: null, reviewed: false, needsReview: true, reviewedAt: null, linkedExpense: null, splits: [],
};

beforeEach(() => vi.restoreAllMocks());

it('shows all transactions, then categorizes only the item that needs review', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/banking/transactions?')) return new Response(JSON.stringify({ transactions: [transaction] }), { status: 200 });
    if (url.endsWith('/banking/transactions/tx-1/review')) return new Response(JSON.stringify({ transaction: { ...transaction, category: 'shopping', note: 'Office supplies', reviewed: true, reviewedAt: Date.now() } }), { status: 200 });
    return new Response(JSON.stringify({ error: 'Unexpected request' }), { status: 500 });
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<TransactionReviewCenter onBack={() => {}} />);

  fireEvent.click(await screen.findByRole('button', { name: 'Needs category' }));
  fireEvent.click(await screen.findByRole('button', { name: /Corner Cafe/ }));
  fireEvent.change(screen.getByLabelText('CATEGORY'), { target: { value: 'shopping' } });
  fireEvent.change(screen.getByLabelText('NOTE'), { target: { value: 'Office supplies' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining('/banking/transactions/tx-1/review'), expect.objectContaining({
    method: 'PUT',
    body: JSON.stringify({ category: 'shopping', excluded: false, note: 'Office supplies', reviewed: true, splits: [] }),
  })));
  expect(await screen.findByText('Everything is categorized')).toBeInTheDocument();
});

it('requires split amounts to equal the charge before saving', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ transactions: [transaction] }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<TransactionReviewCenter onBack={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: /Corner Cafe/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /Split across categories/ }));
  fireEvent.change(screen.getByLabelText('Split 1 amount'), { target: { value: '5.00' } });
  fireEvent.change(screen.getByLabelText('Split 2 amount'), { target: { value: '5.00' } });
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  expect(screen.getByText('$10.00 of $12.50 allocated')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Split 2 amount'), { target: { value: '7.50' } });
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
});
