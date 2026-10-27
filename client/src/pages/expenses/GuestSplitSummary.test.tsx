import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import GuestSplitSummary from './GuestSplitSummary';
vi.mock('./splitImage', () => ({ createSplitImage: vi.fn().mockRejectedValue(new Error('Unavailable in test')) }));
it('separates the payer share from reimbursements and copies accurate sharing text', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  try {
    render(<GuestSplitSummary members={[{ id: 'a', name: 'Eva' }, { id: 'b', name: 'Amy' }]} onEdit={() => {}} split={{ name: 'Dinner', payerId: 'a', date: '2026-10-27', mode: 'equal', items: [], feeCents: 0, totalCents: 21609, assignments: {}, shares: [{ memberId: 'a', baseCents: 11952, totalCents: 11952, reimbursementCents: 0 }, { memberId: 'b', baseCents: 9657, totalCents: 9657, reimbursementCents: 9657 }] }} />);
    expect(screen.getByText('Pays Eva')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Share split' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy text' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0]![0]).toContain('Amy → Eva: $96.57');
    expect(writeText.mock.calls[0]![0]).toContain('Eva’s own share: $119.52');
    expect(writeText.mock.calls[0]![0]).not.toContain('Eva → Eva');
  } finally {
    if (original) Object.defineProperty(navigator, 'clipboard', original);
    else Reflect.deleteProperty(navigator, 'clipboard');
  }
});
