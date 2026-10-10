import ReceiptViewer from './ReceiptViewer';
import Avatar from '../../components/common/Avatar';
import ExpensePayments from './ExpensePayments';
import { paymentFor, type PaymentAction } from './payments';
import { useState } from 'react';
import arrowLeft from '../../assets/expense-arrow-left.svg';
import { formatCents, type PreviewSplit, type SplitMember } from './split';
import './expenses.css';
import './split.css';
import './details.css';

type Expense = { title: string; subtitle: string; amount: string; split?: PreviewSplit };

export default function ExpenseDetails({ expense, groupName, members, onBack, onEdit, onPaymentAction, onPaymentViewChange }: {
  expense: Expense; groupName: string; members: SplitMember[]; onBack: () => void; onEdit: () => void; onPaymentAction: (memberId: string, action: PaymentAction) => void | Promise<void>; onPaymentViewChange: (visible: boolean) => void;
}) {
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [selectedContributor, setSelectedContributor] = useState<{ itemId: number; memberId: string } | null>(null);
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const split = expense.split;
  const name = (id: string) => id === 'you' ? 'You' : split?.memberNames?.[id] ?? members.find(member => member.id === id)?.name ?? 'Member';
  const ownPayment = split ? paymentFor(split, 'you') : undefined;
  const payer = split?.payerId === 'you';
  const editLocked = !!split?.expenseId && (split.hasPaymentHistory || (split.creatorId !== 'you' && !payer));
  const changeTab = (open: boolean) => { setPaymentsOpen(open); setNotice(''); onPaymentViewChange(open); };
  const paymentNotice = () => split ? changeTab(true) : setNotice('Payment records are unavailable for this sample.');
  return <main className="expense-screen expense-details-screen">
    {receiptOpen && split?.expenseId && split.receiptName && <ReceiptViewer expenseId={split.expenseId} name={split.receiptName} onClose={() => setReceiptOpen(false)} />}
    <header className="expense-header"><button type="button" aria-label="Back to group" onClick={onBack}><img src={arrowLeft} alt="" /></button><h1>{paymentsOpen ? 'Payment status' : 'Expense details'}</h1></header>
    <div className={`expense-body details-body ${paymentsOpen ? `payment-body ${payer ? 'payer-payments' : ''}` : ''}`}>
      <div className="details-tabs" aria-label="Expense views">
        <button type="button" aria-pressed={!paymentsOpen} onClick={() => changeTab(false)}>Details</button>
        <button type="button" aria-pressed={paymentsOpen} onClick={paymentNotice}>Payments</button>
      </div>
      {paymentsOpen && split ? <ExpensePayments split={split} groupName={groupName} members={members} busy={paymentBusy} onAction={async (memberId, action) => {
        if (paymentBusy) return;
        setPaymentBusy(true); setNotice('');
        try { await onPaymentAction(memberId, action); }
        catch (error) { setNotice(error instanceof Error ? error.message : 'Could not update payment. Please retry.'); }
        finally { setPaymentBusy(false); }
      }} /> : <>
      <section className="details-card details-report">
        <h2>{expense.title}</h2>
        <p>{groupName}{split && ` · ${new Date(split.date).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })}`}</p>
        <p>{split ? `Paid by ${name(split.payerId)} · Created by ${split.creatorId && split.creatorId !== 'you' ? split.creatorName : 'you'}` : expense.subtitle}</p>
      </section>
      <section className="details-card details-payment" aria-label="Your payment">
        <div><h2>{payer ? 'You paid this expense' : `Your payment · ${split ? paymentFor(split, 'you').status : 'Unavailable'}`}</h2>
          <p>{split ? payer ? 'You don’t owe a payment to yourself.' : ownPayment?.status === 'Settled' ? `${formatCents(ownPayment.received)} received by ${name(split.payerId)}` : ownPayment?.record?.pendingCents ? `${formatCents(ownPayment.record.pendingCents)} reported sent to ${name(split.payerId)}` : `${formatCents(ownPayment?.remaining ?? 0)} share payable to ${name(split.payerId)}` : 'Payment records are unavailable for this sample.'}</p>
        </div>
        <button type="button" className="expense-outline" onClick={paymentNotice}>View</button>
      </section>
      <section className="details-card" aria-label="Items and fees">
        <h2>Items &amp; fees</h2>
        {split && <p className="details-avatar-hint">Tap an avatar to view their share</p>}
        {split ? <>
          {split.items.map(item => {
            const contributors = split.shares.filter(share => split.mode === 'equal' || split.assignments[item.id]?.includes(share.memberId));
            return <section className="details-item" key={item.id} aria-label={`Contributors for ${item.name}`}>
              <div className="details-row"><strong>{item.name}{(item.quantity ?? 1) > 1 && ` × ${item.quantity}`}</strong><strong>{formatCents(item.cents)}</strong></div>
              <div className="details-item-sharing"><p>{split.mode === 'equal' ? 'Shared equally by everyone' : `Shared by ${contributors.length}`}</p>
              <div className="details-contributors">{contributors.map(share => {
                const active = selectedContributor?.itemId === item.id && selectedContributor.memberId === share.memberId;
                const memberIndex = members.findIndex(person => person.id === share.memberId);
                const colorIndex = memberIndex >= 0 ? memberIndex : split.shares.findIndex(person => person.memberId === share.memberId);
                return <button type="button" key={share.memberId} aria-label={`View ${name(share.memberId)}’s share of ${item.name}`} aria-pressed={active} onClick={() => setSelectedContributor(active ? null : { itemId: item.id, memberId: share.memberId })}><span className={`split-avatar details-contributor-avatar tone-${colorIndex % 4}`} aria-hidden="true"><Avatar name={name(share.memberId)} /></span></button>;
              })}</div></div>
              {contributors.filter(share => selectedContributor?.itemId === item.id && selectedContributor.memberId === share.memberId).map(share => {
                const index = contributors.indexOf(share);
                const amount = Math.floor(item.cents / contributors.length) + (index < item.cents % contributors.length ? 1 : 0);
                return <div className="details-contributor-info" role="status" key={share.memberId}><span>{name(share.memberId)}{share.memberId === split.payerId ? ' · Payer' : ''}</span><strong>{split.mode === 'items' ? `${formatCents(amount)} before fees` : 'Equal share · See totals below'}</strong></div>;
              })}
              {!contributors.length && <p>No participants assigned.</p>}
            </section>;
          })}
          {split.feeBreakdown ? Object.entries(split.feeBreakdown).map(([key, value]) => <div className="details-row" key={key}><span>{{ tax: 'Tax', tip: 'Tip', other: 'Other fees' }[key]}</span><span>{formatCents(value)}</span></div>) : <div className="details-row"><span>Tax, tip &amp; fees</span><span>{formatCents(split.feeCents)}</span></div>}
          <div className="details-row details-total"><strong>Total</strong><strong>{formatCents(split.totalCents)}</strong></div>
          {split.receiptName && split.expenseId ? <button type="button" className="expense-outline" onClick={() => setReceiptOpen(true)}>View receipt</button> : split.receiptName ? <p>Receipt · {split.receiptName} (local selection only)</p> : null}
        </> : <><div className="details-row"><span>Listed amount</span><strong>{expense.amount}</strong></div><p>Sample transaction · This is the amount shown in the group list. Item breakdowns are unavailable.</p></>}
      </section>
      <section className="details-card" aria-label="Split shares">
        <h2>{split ? `${split.mode === 'equal' ? 'Equal split' : 'Split by item'} · ${split.shares.length} people` : 'Split summary'}</h2>
        {split ? split.shares.map(share => <div className="details-row" key={share.memberId}><span>{name(share.memberId)}{share.memberId === split.payerId ? ' · Payer' : ''}</span><span>{formatCents(share.totalCents)}</span></div>) : <p>Split details are unavailable for this sample.</p>}
      </section>
      </>}
      {notice && <p className="form-notice" role="status">{notice}</p>}
      {split && !paymentsOpen && <p className="details-preview">{split.expenseId ? (editLocked ? split.hasPaymentHistory ? 'Editing is locked because this expense has payment history.' : 'Only the expense creator or payer can edit.' : 'Saved to your group.') : 'Session-only preview. Live balances are not connected.'}</p>}
    </div>
    {!paymentsOpen && <footer className="expense-footer"><button type="button" className="expense-outline" disabled={editLocked} onClick={() => split ? onEdit() : setNotice('This sample has no item or split records to edit. Create an expense to try the editing flow.')}>Edit expense</button></footer>}
  </main>;
}
