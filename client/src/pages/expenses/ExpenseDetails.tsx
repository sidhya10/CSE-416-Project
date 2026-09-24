import { useState } from 'react';
import arrowLeft from '../../assets/expense-arrow-left.svg';
import { formatCents, type PreviewSplit, type SplitMember } from './split';
import './expenses.css';
import './details.css';

type Expense = { title: string; subtitle: string; amount: string; split?: PreviewSplit };

export default function ExpenseDetails({ expense, groupName, members, onBack }: {
  expense: Expense; groupName: string; members: SplitMember[]; onBack: () => void;
}) {
  const [notice, setNotice] = useState('');
  const split = expense.split;
  const name = (id: string) => id === 'you' ? 'You' : members.find(member => member.id === id)?.name ?? 'Member';
  const ownShare = split?.shares.find(share => share.memberId === 'you');
  const payer = split?.payerId === 'you';
  const paymentNotice = () => setNotice('Payment tracking is not connected yet. No payment has been recorded for this preview.');
  return <main className="expense-screen expense-details-screen">
    <header className="expense-header"><button type="button" aria-label="Back to group" onClick={onBack}><img src={arrowLeft} alt="" /></button><h1>Expense details</h1></header>
    <div className="expense-body details-body">
      <div className="details-tabs" aria-label="Expense views">
        <button type="button" aria-pressed="true" onClick={() => setNotice('')}>Details</button>
        <button type="button" aria-pressed="false" onClick={paymentNotice}>Payments</button>
      </div>
      <section className="details-card details-report">
        <h2>{expense.title}</h2>
        <p>{groupName}{split && ` · ${new Date(split.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}</p>
        <p>{split ? `Paid by ${name(split.payerId)} · Created by you` : expense.subtitle}</p>
      </section>
      <section className="details-card details-payment" aria-label="Your payment">
        <div><h2>{payer ? 'You paid this expense' : 'Your payment · Preview'}</h2>
          <p>{split ? payer ? 'You don’t owe a payment to yourself.' : `${formatCents(ownShare?.reimbursementCents ?? 0)} share payable to ${name(split.payerId)}` : 'Payment records are unavailable for this sample.'}</p>
        </div>
        <button type="button" className="expense-outline" onClick={paymentNotice}>View</button>
      </section>
      <section className="details-card" aria-label="Items and fees">
        <h2>Items &amp; fees</h2>
        {split ? <>
          {split.items.map(item => <div className="details-row" key={item.id}><span>{item.name}</span><span>{formatCents(item.cents)}</span></div>)}
          {split.feeBreakdown ? Object.entries(split.feeBreakdown).map(([key, value]) => <div className="details-row" key={key}><span>{{ tax: 'Tax', tip: 'Tip', other: 'Other fees' }[key]}</span><span>{formatCents(value)}</span></div>) : <div className="details-row"><span>Tax, tip &amp; fees</span><span>{formatCents(split.feeCents)}</span></div>}
          <div className="details-row details-total"><strong>Total</strong><strong>{formatCents(split.totalCents)}</strong></div>
          <p>Receipt · {split.receiptName ? `${split.receiptName} (local selection only)` : 'No attachment'}</p>
        </> : <><div className="details-row"><span>Listed amount</span><strong>{expense.amount}</strong></div><p>Sample transaction · This is the amount shown in the group list. Item breakdowns are unavailable.</p></>}
      </section>
      <section className="details-card" aria-label="Split shares">
        <h2>{split ? `${split.mode === 'equal' ? 'Equal split' : 'Split by item'} · ${split.shares.length} people` : 'Split summary'}</h2>
        {split ? split.shares.map(share => <div className="details-row" key={share.memberId}><span>{name(share.memberId)}{share.memberId === split.payerId ? ' · Payer' : ''}</span><span>{formatCents(share.totalCents)}</span></div>) : <p>Split details are unavailable for this sample.</p>}
      </section>
      {notice && <p className="form-notice" role="status">{notice}</p>}
      {split && <p className="details-preview">Session-only preview. Payments and live balances are not connected.</p>}
    </div>
    <footer className="expense-footer"><button type="button" className="expense-outline" onClick={() => setNotice('Editing saved expenses is not connected yet.')}>Edit expense</button></footer>
  </main>;
}
