import ExpensePayments from './ExpensePayments';
import { paymentFor, type PaymentAction } from './payments';
import { useState } from 'react';
import arrowLeft from '../../assets/expense-arrow-left.svg';
import { formatCents, type PreviewSplit, type SplitMember } from './split';
import './expenses.css';
import './details.css';

type Expense = { title: string; subtitle: string; amount: string; split?: PreviewSplit };

export default function ExpenseDetails({ expense, groupName, members, onBack, onEdit, onPaymentAction, onPaymentViewChange }: {
  expense: Expense; groupName: string; members: SplitMember[]; onBack: () => void; onEdit: () => void; onPaymentAction: (memberId: string, action: PaymentAction) => void; onPaymentViewChange: (visible: boolean) => void;
}) {
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const split = expense.split;
  const name = (id: string) => id === 'you' ? 'You' : members.find(member => member.id === id)?.name ?? 'Member';
  const ownPayment = split ? paymentFor(split, 'you') : undefined;
  const payer = split?.payerId === 'you';
  const changeTab = (open: boolean) => { setPaymentsOpen(open); setNotice(''); onPaymentViewChange(open); };
  const paymentNotice = () => split ? changeTab(true) : setNotice('Payment records are unavailable for this sample.');
  return <main className="expense-screen expense-details-screen">
    <header className="expense-header"><button type="button" aria-label="Back to group" onClick={onBack}><img src={arrowLeft} alt="" /></button><h1>{paymentsOpen ? 'Payment status' : 'Expense details'}</h1></header>
    <div className={`expense-body details-body ${paymentsOpen ? `payment-body ${payer ? 'payer-payments' : ''}` : ''}`}>
      <div className="details-tabs" aria-label="Expense views">
        <button type="button" aria-pressed={!paymentsOpen} onClick={() => changeTab(false)}>Details</button>
        <button type="button" aria-pressed={paymentsOpen} onClick={paymentNotice}>Payments</button>
      </div>
      {paymentsOpen && split ? <ExpensePayments split={split} groupName={groupName} members={members} onAction={onPaymentAction} /> : <>
      <section className="details-card details-report">
        <h2>{expense.title}</h2>
        <p>{groupName}{split && ` · ${new Date(split.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}</p>
        <p>{split ? `Paid by ${name(split.payerId)} · Created by you` : expense.subtitle}</p>
      </section>
      <section className="details-card details-payment" aria-label="Your payment">
        <div><h2>{payer ? 'You paid this expense' : `Your payment · ${split ? paymentFor(split, 'you').status : 'Unavailable'}`}</h2>
          <p>{split ? payer ? 'You don’t owe a payment to yourself.' : ownPayment?.status === 'Settled' ? `${formatCents(ownPayment.received)} received by ${name(split.payerId)}` : ownPayment?.record?.pendingCents ? `${formatCents(ownPayment.record.pendingCents)} reported sent to ${name(split.payerId)}` : `${formatCents(ownPayment?.remaining ?? 0)} share payable to ${name(split.payerId)}` : 'Payment records are unavailable for this sample.'}</p>
        </div>
        <button type="button" className="expense-outline" onClick={paymentNotice}>View</button>
      </section>
      <section className="details-card" aria-label="Items and fees">
        <h2>Items &amp; fees</h2>
        {split ? <>
          {split.items.map(item => <div className="details-row" key={item.id}><span>{item.name}{(item.quantity ?? 1) > 1 && ` × ${item.quantity}`}</span><span>{formatCents(item.cents)}</span></div>)}
          {split.feeBreakdown ? Object.entries(split.feeBreakdown).map(([key, value]) => <div className="details-row" key={key}><span>{{ tax: 'Tax', tip: 'Tip', other: 'Other fees' }[key]}</span><span>{formatCents(value)}</span></div>) : <div className="details-row"><span>Tax, tip &amp; fees</span><span>{formatCents(split.feeCents)}</span></div>}
          <div className="details-row details-total"><strong>Total</strong><strong>{formatCents(split.totalCents)}</strong></div>
          <p>Receipt · {split.receiptName ? `${split.receiptName} (local selection only)` : 'No attachment'}</p>
        </> : <><div className="details-row"><span>Listed amount</span><strong>{expense.amount}</strong></div><p>Sample transaction · This is the amount shown in the group list. Item breakdowns are unavailable.</p></>}
      </section>
      <section className="details-card" aria-label="Split shares">
        <h2>{split ? `${split.mode === 'equal' ? 'Equal split' : 'Split by item'} · ${split.shares.length} people` : 'Split summary'}</h2>
        {split ? split.shares.map(share => <div className="details-row" key={share.memberId}><span>{name(share.memberId)}{share.memberId === split.payerId ? ' · Payer' : ''}</span><span>{formatCents(share.totalCents)}</span></div>) : <p>Split details are unavailable for this sample.</p>}
      </section>
      </>}
      {notice && <p className="form-notice" role="status">{notice}</p>}
      {split && !paymentsOpen && <p className="details-preview">Session-only preview. Live balances are not connected.</p>}
    </div>
    {!paymentsOpen && <footer className="expense-footer"><button type="button" className="expense-outline" onClick={() => split ? onEdit() : setNotice('This sample has no item or split records to edit. Create an expense to try the editing flow.')}>Edit expense</button></footer>}
  </main>;
}
