import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ExpenseEntry from './ExpenseEntry';
import { scanReceipt } from '../../api/receipts.api';
import type { PreviewSplit } from './split';
vi.mock('../../api/receipts.api', async importOriginal => ({ ...await importOriginal<typeof import('../../api/receipts.api')>(), scanReceipt: vi.fn() }));
const receipt = { merchant: 'Cafe', items: [{ name: 'Tea', quantity: 2, unitPriceCents: 250 }], taxCents: 40, tipCents: 100, totalCents: 640, warnings: ['Review values.'] };
const props = { groupName: 'Trip', members: [{ id: 'you', name: 'You' }], onBack: vi.fn(), onConfirm: vi.fn() };
const choose = () => fireEvent.change(document.querySelector('input[accept="image/*,application/pdf,.heic,.heif"]')!, { target: { files: [new File(['receipt'], 'cafe.png', { type: 'image/png' })] } });
afterEach(() => vi.resetAllMocks());
describe('receipt scan review in add and edit expenses', () => {
  it.each([false, true])('applies only after review, preserving the payer and title (editing=%s)', async editing => {
    vi.mocked(scanReceipt).mockResolvedValue({ receipt, cached: true });
    const initialSplit: PreviewSplit = { name: 'Existing dinner', items: [{ id: 0, name: 'Soup', cents: 1000 }], payerId: 'you', date: '2026-10-09', mode: 'equal', feeCents: 0, totalCents: 1000, assignments: {}, shares: [] };
    render(<ExpenseEntry {...props} initialSplit={editing ? initialSplit : undefined} />);
    fireEvent.change(screen.getByLabelText('EXPENSE NAME'), { target: { value: 'My dinner' } });
    fireEvent.change(screen.getByLabelText('Item 1 name'), { target: { value: 'Manual item' } });
    choose();
    expect(scanReceipt).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Scan receipt with Azure' }));
    expect(await screen.findByRole('region', { name: 'Receipt scan review' })).toHaveTextContent('Tea');
    expect(screen.getByLabelText('Item 1 name')).toHaveValue('Manual item');
    expect(screen.getByRole('status')).toHaveTextContent('no new Azure scan');
    fireEvent.click(screen.getByRole('button', { name: 'Replace entries with scanned items' }));
    expect(screen.getByLabelText('Item 1 name')).toHaveValue('Tea');
    expect(screen.getByLabelText('Item 1 amount')).toHaveValue('2.50');
    expect(screen.getByLabelText('Item 1 quantity')).toHaveValue('2');
    expect(screen.getByLabelText('Tax')).toHaveValue('0.40');
    expect(screen.getByLabelText('EXPENSE NAME')).toHaveValue('My dinner');
    expect(screen.getByRole('button', { name: 'Paid by you · Change' })).toBeInTheDocument();
    expect(screen.getByLabelText('Item 1 total')).toHaveTextContent('$5.00');
  });
  it('keeps manual entries when the scan fails', async () => {
    vi.mocked(scanReceipt).mockRejectedValue(new Error('Monthly scan limit reached'));
    render(<ExpenseEntry {...props} />);
    fireEvent.change(screen.getByLabelText('Item 1 name'), { target: { value: 'Manual' } });
    choose();
    fireEvent.click(screen.getByRole('button', { name: 'Scan receipt with Azure' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Monthly scan limit reached'));
    expect(screen.getByLabelText('Item 1 name')).toHaveValue('Manual');
  });
  it('ignores a late result after receipt removal', async () => {
    let finish!: (value: { receipt: typeof receipt; cached: boolean }) => void;
    vi.mocked(scanReceipt).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<ExpenseEntry {...props} />);
    choose();
    fireEvent.click(screen.getByRole('button', { name: 'Scan receipt with Azure' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove receipt' }));
    finish({ receipt, cached: false });
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Receipt scan review' })).not.toBeInTheDocument());
    expect(screen.getByLabelText('Item 1 name')).toHaveValue('');
  });
});

it('accepts an iPhone HEIC with missing MIME type and keeps oversized files out', async () => {
  vi.mocked(scanReceipt).mockResolvedValue({ receipt, cached: false });
  render(<ExpenseEntry {...props} />);
  const input = document.querySelector('input[accept="image/*,application/pdf,.heic,.heif"]')!;
  const file = new File(['heic'], 'IMG_1234.HEIC');
  fireEvent.change(input, { target: { files: [file] } });
  expect(screen.getByText('IMG_1234.HEIC')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Scan receipt with Azure' }));
  await screen.findByRole('region', { name: 'Receipt scan review' });
  expect(scanReceipt).toHaveBeenCalledWith(file, expect.any(AbortSignal));
  fireEvent.change(input, { target: { files: [new File([new Uint8Array(12 * 1024 * 1024 + 1)], 'large.heic', { type: 'image/heic' })] } });
  expect(screen.getByRole('status')).toHaveTextContent('12 MB');
  expect(screen.getByText('IMG_1234.HEIC')).toBeInTheDocument();
});
