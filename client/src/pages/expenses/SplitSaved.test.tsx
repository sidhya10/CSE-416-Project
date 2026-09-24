import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SplitSaved from './SplitSaved';
import { calculateSplit, type PreviewSplit } from './split';
const members = [{ id: 'you', name: 'Vivian' }, { id: 'nicole', name: 'Nicole Chen' }, { id: 'eva', name: 'Eva Lin' }, { id: 'sidhya', name: 'Sidhya Shah' }];
function fixture(mode: 'equal' | 'items', payerId = 'nicole'): PreviewSplit {
  const items = [{ id: 0, name: 'Pad Thai', cents: 1850 }, { id: 1, name: 'Green Curry', cents: 2200 }, { id: 2, name: 'Spring Rolls', cents: 1200 }];
  const assignments = { 0: ['you', 'nicole'], 1: ['nicole', 'eva', 'sidhya'], 2: members.map(m => m.id) };
  const result = calculateSplit(items, 2500, members, payerId, mode, assignments);
  return { name: 'Dinner', payerId, date: '2026-09-12T12:00:00', mode, items, feeCents: 2500, totalCents: result.totalCents, assignments, shares: result.shares };
}
describe('Split saved confirmations', () => {
  it('shows equal shares and actual rounding, and both back buttons return to the group', () => {
    const back = vi.fn();
    render(<SplitSaved split={fixture('equal')} members={members} onBack={back} />);
    expect(screen.getByRole('heading', { name: 'You owe Nicole' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Your split outcome' })).getByText('$19.38')).toBeInTheDocument();
    expect(screen.getByText(/extra 2¢/)).toHaveTextContent('Vivian and Nicole');
    screen.getAllByRole('button', { name: 'Back to group' }).forEach(button => fireEvent.click(button));
    expect(back).toHaveBeenCalledTimes(2);
  });
  it('shows item assignments and proportional fees for the current member', () => {
    render(<SplitSaved split={fixture('items')} members={members} onBack={() => {}} />);
    expect(within(screen.getByRole('region', { name: 'Your split outcome' })).getByText('$18.08')).toBeInTheDocument();
    expect(screen.getByText('Nicole + Eva + Sidhya')).toBeInTheDocument();
    expect(screen.getByText('$12.25 in items + $5.83 in fees')).toBeInTheDocument();
  });
  it.each(['equal', 'items'] as const)('shows money owed to the payer, excluding their share in %s mode', mode => {
    const split = fixture(mode, 'you');
    render(<SplitSaved split={split} members={members} onBack={() => {}} />);
    expect(screen.getByRole('heading', { name: 'The group owes you' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Your split outcome' })).getByText(mode === 'equal' ? '$58.12' : '$59.42')).toBeInTheDocument();
    expect(screen.getByText('Your share is already covered. You owe nothing.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /You owe / })).not.toBeInTheDocument();
  });
});
