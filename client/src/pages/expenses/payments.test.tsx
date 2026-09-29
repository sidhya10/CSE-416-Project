import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ExpensePayments from './ExpensePayments';
import { paymentFor, updatePayment } from './payments';
import { calculateSplit, type PreviewSplit } from './split';

const members = [{ id: 'you', name: 'You' }, { id: 'nicole', name: 'Alex' }, { id: 'eva', name: 'Jordan' }, { id: 'sidhya', name: 'Taylor' }];
function expense(): PreviewSplit {
  const items = [{ id: 1, name: 'Dinner', cents: 7750 }];
  const result = calculateSplit(items, 0, members, 'nicole', 'equal', {});
  return { name: 'Dinner', payerId: 'nicole', date: '2026-09-12T12:00:00Z', mode: 'equal', items, feeCents: 0, totalCents: result.totalCents, assignments: {}, shares: result.shares };
}
function Harness() {
  const [split, setSplit] = useState(expense);
  const [actor, setActor] = useState('you');
  return <><button onClick={() => setActor(actor === 'you' ? 'nicole' : 'you')}>Switch test actor</button><ExpensePayments split={split} members={members} groupName="Weekend Trip" currentUserId={actor} onAction={(member, action) => setSplit(previous => updatePayment(previous, actor, member, action))} /></>;
}

describe('Payment tracking', () => {
  it('supports all member and payer states with role-specific actions and exact collection totals', () => {
    render(<Harness />);
    expect(screen.getByRole('region', { name: 'Your payment' })).toHaveTextContent('Not sent');
    expect(screen.queryByRole('heading', { name: 'Member payments' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm payment' }));
    expect(screen.getByRole('region', { name: 'Your payment' })).toHaveTextContent('Awaiting receipt');
    expect(screen.queryByRole('button', { name: 'Confirm receipt' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Switch test actor' }));
    expect(screen.getByRole('region', { name: 'Collection summary' })).toHaveTextContent('$58.12');
    expect(screen.queryByRole('region', { name: 'Alex payment' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Not received' }));
    expect(screen.getByRole('region', { name: 'You payment' })).toHaveTextContent('Payment issue');
    fireEvent.click(screen.getByRole('button', { name: 'Switch test actor' }));
    expect(screen.getByRole('region', { name: 'Your payment' })).toHaveTextContent('Check the recipient');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm payment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Switch test actor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm receipt' }));
    expect(screen.getByRole('region', { name: 'Collection summary' })).toHaveTextContent('$38.74');
    expect(screen.getByRole('region', { name: 'Collection summary' })).toHaveTextContent('1 of 3 payments settled');
    fireEvent.click(screen.getByRole('button', { name: 'Switch test actor' }));
    expect(screen.getByRole('region', { name: 'Your payment' })).toHaveTextContent('Settled');
    expect(screen.getByRole('region', { name: 'Payment progress' })).toHaveTextContent('Received');
    expect(screen.queryByRole('button', { name: 'Confirm payment' })).not.toBeInTheDocument();
  });

  it('lets the payer resolve an issue when the money arrives', () => {
    const sent = updatePayment(expense(), 'you', 'you', 'sent');
    const issue = updatePayment(sent, 'nicole', 'you', 'issue');
    render(<ExpensePayments split={issue} members={members} groupName="Boston" currentUserId="nicole" onAction={() => {}} />);
    expect(within(screen.getByRole('region', { name: 'You payment' })).getByRole('button', { name: 'Now received' })).toBeInTheDocument();
    const settled = updatePayment(issue, 'nicole', 'you', 'received');
    expect(paymentFor(settled, 'you').status).toBe('Settled');
    expect(updatePayment(settled, 'nicole', 'you', 'received')).toBe(settled);
  });

  it('rejects unauthorized transitions, self-payment, and duplicate reports', () => {
    const split = expense();
    expect(updatePayment(split, 'you', 'eva', 'sent')).toBe(split);
    expect(updatePayment(split, 'nicole', 'nicole', 'sent')).toBe(split);
    expect(updatePayment(split, 'nicole', 'you', 'received')).toBe(split);
    const sent = updatePayment(split, 'you', 'you', 'sent');
    expect(updatePayment(sent, 'you', 'you', 'received')).toBe(sent);
    expect(updatePayment(sent, 'you', 'you', 'issue')).toBe(sent);
    expect(updatePayment(sent, 'you', 'you', 'sent')).toBe(sent);
    expect(paymentFor(sent, 'eva').status).toBe('Not sent');
  });

  it('retains money already received after share edits and isolates records by payer', () => {
    const settled = updatePayment(updatePayment(expense(), 'you', 'you', 'sent'), 'nicole', 'you', 'received');
    const changed = { ...settled, shares: settled.shares.map(share => share.memberId === 'you' ? { ...share, reimbursementCents: 2500 } : share) };
    expect(paymentFor(changed, 'you').remaining).toBe(562);
    const resent = updatePayment(changed, 'you', 'you', 'sent');
    expect(paymentFor(resent, 'you').record?.pendingCents).toBe(562);
    expect(paymentFor(updatePayment(resent, 'nicole', 'you', 'received'), 'you').received).toBe(2500);
    expect(paymentFor({ ...settled, payerId: 'eva' }, 'you').received).toBe(0);
  });

  it('does not offer payment for an unassigned member with no share', () => {
    const split = expense();
    split.shares = split.shares.map(share => share.memberId === 'you' ? { ...share, reimbursementCents: 0, totalCents: 0 } : share);
    render(<ExpensePayments split={split} members={members} groupName="Boston" onAction={() => {}} />);
    expect(screen.getByRole('region', { name: 'Your payment' })).toHaveTextContent('No payment needed');
    expect(screen.queryByRole('button', { name: 'Confirm payment' })).not.toBeInTheDocument();
  });
});
