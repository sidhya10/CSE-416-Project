import Avatar from '../../components/common/Avatar';
import { formatCents, type PreviewSplit, type SplitMember } from './split';
import { paymentFor, type PaymentAction } from './payments';
import './payments.css';

const timestamp = (date?: string) => date ? new Date(date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

export default function ExpensePayments({ split, members, groupName, currentUserId = 'you', busy = false, onAction }: {
  split: PreviewSplit; members: SplitMember[]; groupName: string; currentUserId?: string; busy?: boolean;
  onAction: (memberId: string, action: PaymentAction) => void;
}) {
  const name = (id: string) => id === 'you' ? 'You' : members.find(member => member.id === id)?.name.split(' ')[0] ?? 'Member';
  const isPayer = currentUserId === split.payerId;
  const payerName = name(split.payerId);
  const own = paymentFor(split, currentUserId);
  const debtors = split.shares.filter(share => share.memberId !== split.payerId);
  const expected = debtors.reduce((sum, share) => sum + share.reimbursementCents, 0);
  const received = debtors.reduce((sum, share) => sum + paymentFor(split, share.memberId).received, 0);
  const remaining = debtors.reduce((sum, share) => sum + paymentFor(split, share.memberId).remaining, 0);
  const settled = debtors.filter(share => share.reimbursementCents > 0 && paymentFor(split, share.memberId).remaining === 0).length;
  const avatar = (id: string) => <span className={`payment-avatar tone-${Math.max(0, members.findIndex(member => member.id === id)) % 4}`}><Avatar name={name(id)} /></span>;
  return <>
    <section className="details-card payment-card">
      <div className="payment-person">{avatar(split.payerId)}<div><h2>{split.name}</h2><p>{groupName} · {new Date(split.date).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })}</p></div></div>
      <p>Paid by {isPayer ? 'you' : payerName} · Added by {split.creatorId ? split.creatorId === 'you' ? 'you' : split.creatorName : 'you'}</p>
    </section>
    {isPayer ? <>
      <section className="details-card payment-card" aria-label="Collection summary">
        <div className="details-row"><span>Still to receive</span><strong className="payment-accent">{formatCents(remaining)}</strong></div>
        <p>{formatCents(received)} received of {formatCents(expected)} · {settled} of {debtors.filter(share => share.reimbursementCents > 0).length} payments settled</p>
        <p>You paid {formatCents(split.totalCents)} · Your own share is {formatCents(split.shares.find(share => share.memberId === split.payerId)?.totalCents ?? 0)}</p>
      </section>
      <h2>Member payments</h2>
      {debtors.map(share => {
        const state = paymentFor(split, share.memberId);
        return <section className="details-card payment-card" aria-label={`${name(share.memberId)} payment`} key={share.memberId}>
          <div className="payment-person">{avatar(share.memberId)}<div><div className="details-row"><h2>{name(share.memberId)}</h2><strong>{formatCents(share.reimbursementCents)}</strong></div><p className={`payment-status ${state.status === 'Payment issue' ? 'issue' : state.status === 'Settled' ? 'settled' : ''}`}>{state.status}</p></div></div>
          <p>{state.status === 'Awaiting receipt' ? `Reported sent ${timestamp(state.record?.sentAt)}` : state.status === 'Payment issue' ? 'You reported that payment has not arrived.' : state.status === 'Settled' ? `Sent ${timestamp(state.record?.sentAt)} · Received ${timestamp(state.record?.receivedAt)}` : state.status === 'No payment needed' ? 'This member has no share to reimburse.' : `Waiting for ${name(share.memberId)} to report payment.`}</p>
          {!!state.record?.pendingCents && state.record.pendingCents !== state.remaining && <p>Reported amount: {formatCents(state.record.pendingCents)} · Updated amount due: {formatCents(state.remaining)}</p>}
          {state.received > state.share && <p>Overpaid by {formatCents(state.received - state.share)} after expense edits. Arrange any refund outside the app.</p>}
          {state.status === 'Awaiting receipt' && <div className="payment-actions"><button type="button" className="primary-button" disabled={busy} onClick={() => onAction(share.memberId, 'received')}>Confirm receipt</button><button type="button" className="expense-outline" disabled={busy} onClick={() => onAction(share.memberId, 'issue')}>Not received</button></div>}
          {state.status === 'Payment issue' && <div className="payment-actions"><button type="button" className="primary-button" disabled={busy} onClick={() => onAction(share.memberId, 'received')}>Now received</button></div>}
        </section>;
      })}
      <p className="payment-footnote">Only confirm money you have received. Your own share needs no reimbursement.</p>
    </> : <>
      <section className="details-card payment-card payment-own" aria-label="Your payment">
        <h2 className={own.status === 'Payment issue' ? 'issue' : 'payment-accent'}>{own.status}</h2>
        <p>{own.status === 'Awaiting receipt' ? 'You reported sending' : own.status === 'Settled' ? `Paid to ${payerName}` : own.status === 'Payment issue' ? `${payerName} has not received` : own.status === 'No payment needed' ? 'You have no amount to reimburse' : `You owe ${payerName}`}</p>
        <strong className="payment-amount">{formatCents(own.record?.pendingCents || (own.status === 'Settled' ? own.received : own.remaining))}</strong>
        <p>{own.status === 'Awaiting receipt' ? `${payerName} will confirm when your payment arrives. Your balance stays open until then.` : own.status === 'Settled' ? `${payerName} confirmed receipt. You have $0.00 left to pay for this expense.` : own.status === 'Payment issue' ? `Check the recipient and payment details with ${payerName} before sending any more money.` : own.status === 'No payment needed' ? 'No payment is required for this expense.' : `Pay ${payerName} outside the app, then mark your payment as sent.`}</p>
        {(own.status === 'Not sent' || own.status === 'Payment issue') && own.remaining > 0 && <button type="button" className="primary-button" disabled={busy} onClick={() => onAction(currentUserId, 'sent')}>Confirm payment</button>}
        {own.received > own.share && <p>Overpaid by {formatCents(own.received - own.share)} after expense edits. Arrange any refund with {payerName}.</p>}
      </section>
      <section className="details-card payment-card payment-progress" aria-label="Payment progress"><h2>Payment progress</h2>
        <p>{own.record?.sentAt ? `✓  You · Sent ${timestamp(own.record.sentAt)}` : '○  You · Not sent'}</p>
        <p>{own.status === 'Settled' ? `✓  ${payerName} · Received ${timestamp(own.record?.receivedAt)}` : own.status === 'Payment issue' ? `!  ${payerName} · Payment not received` : own.status === 'Awaiting receipt' ? `○  ${payerName} · Receipt pending` : own.status === 'No payment needed' ? '✓  No reimbursement required' : `○  ${payerName} · Awaiting payment`}</p>
      </section>
      <section className="details-card payment-card" aria-label="Your share"><div className="details-row"><span>Expense total</span><span>{formatCents(split.totalCents)}</span></div><div className="details-row"><span>Your share · {split.mode === 'equal' ? 'Equal split' : 'Split by item'}</span><span>{formatCents(own.share)}</span></div><p>Includes tax, tip and fees</p></section>
    </>}
    <p className="payment-footnote">No money moves through the app. {split.expenseId ? 'Payment records are saved to your group.' : 'Payment records are saved for this preview session only.'}</p>
  </>;
}
