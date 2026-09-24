import arrowLeft from '../../assets/expense-arrow-left.svg';
import { formatCents, type PreviewSplit, type SplitMember } from './split';
import './saved.css';

function AmountRow({ label, amount }: { label: string; amount: string }) {
  return <div className="saved-amount-row"><span>{label}</span><strong>{amount}</strong></div>;
}

export default function SplitSaved({ split, members, onBack, currentUserId = 'you' }: {
  split: PreviewSplit; members: SplitMember[]; onBack: () => void; currentUserId?: string;
}) {
  const own = split.shares.find(share => share.memberId === currentUserId)!;
  const isPayer = split.payerId === currentUserId;
  const name = (id: string) => id === 'you' ? 'Vivian' : members.find(member => member.id === id)?.name.split(' ')[0] ?? 'Member';
  const payerName = name(split.payerId);
  const owed = split.totalCents - own.totalCents;
  const subtotal = split.items.reduce((sum, item) => sum + item.cents, 0);
  const groups = new Map<number, string[]>();
  for (const share of split.shares) {
    if (isPayer && share.memberId === currentUserId) continue;
    groups.set(share.totalCents, [...(groups.get(share.totalCents) ?? []), name(share.memberId)]);
  }
  const remainder = split.totalCents % split.shares.length;
  const extraNames = split.shares.filter(share => share.totalCents > Math.floor(split.totalCents / split.shares.length)).map(share => name(share.memberId));
  return <main className="expense-screen saved-screen">
    <header className="expense-header"><button type="button" aria-label="Back to group" onClick={onBack}><img src={arrowLeft} alt="" /></button><h1>Split saved</h1></header>
    <div className="expense-body saved-body">
      <section className="split-context"><h2>{split.name}</h2><div><p>Paid by {isPayer ? `you (${payerName})` : payerName} · {new Date(split.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p><strong>{formatCents(split.totalCents)} total</strong></div></section>
      <h2 className="saved-added">Expense added to the group</h2>
      <section className="saved-impact" aria-label="Your split outcome">
        <h2>{isPayer ? 'The group owes you' : own.totalCents ? `You owe ${payerName}` : 'You owe nothing'}</h2>
        <p>{isPayer ? `You paid ${formatCents(split.totalCents)} · Your share is ${formatCents(own.totalCents)}` : `Your ${split.mode === 'equal' ? 'equal' : 'item'} share · Includes tax, tip & fees`}</p>
        <strong>{formatCents(isPayer ? owed : own.totalCents)}</strong>
        <small>{isPayer ? 'Your share is already covered. You owe nothing.' : `Created by you · ${payerName} paid the original bill.`}</small>
      </section>
      <section className="saved-summary" aria-label="How this is split">
        <h2>How this is split</h2>
        <p className="saved-method">{split.mode === 'equal' ? 'EQUAL SPLIT' : 'BY ITEM'} · {split.shares.length} {split.shares.length === 1 ? 'PERSON' : 'PEOPLE'}</p>
        {split.mode === 'equal' ? <>
          <AmountRow label="Items" amount={formatCents(subtotal)} />
          <AmountRow label="Tax, tip & fees" amount={formatCents(split.feeCents)} />
          <div className="saved-allocations">{[...groups].map(([amount, names]) => <AmountRow key={amount} label={names.join(' + ')} amount={`${formatCents(amount)}${names.length > 1 ? ' each' : ''}`} />)}</div>
        </> : <>
          <div className="saved-items">{split.items.map(item => {
            const assigned = members.filter(member => split.assignments[item.id]?.includes(member.id));
            return <div className="saved-item" key={item.id}><AmountRow label={item.name} amount={formatCents(item.cents)} /><p>{assigned.length === members.length ? 'Shared by everyone' : assigned.map(member => name(member.id)).join(' + ')}</p></div>;
          })}</div>
          <p>Tax, tip &amp; fees: {formatCents(split.feeCents)}, shared in proportion to each person’s items.</p>
        </>}
        <div className="saved-highlight"><AmountRow label={isPayer ? 'Others’ shares' : split.mode === 'equal' ? 'Your share' : 'Your items + fees'} amount={formatCents(isPayer ? owed : own.totalCents)} /></div>
        <p>{isPayer ? `Your ${formatCents(own.totalCents)} share is already covered by the bill you paid.` : split.mode === 'items' ? `${formatCents(own.baseCents)} in items + ${formatCents(own.totalCents - own.baseCents)} in fees` : remainder ? `Split evenly. The extra ${remainder}¢ ${remainder === 1 ? 'goes to' : 'are shared between'} ${extraNames.join(' and ')}.` : 'The total is split evenly, including tax, tip and fees.'}</p>
      </section>
    </div>
    <footer className="expense-footer saved-footer"><button type="button" className="primary-button" onClick={onBack}>Back to group</button><small>Saved in this preview only. Reloading clears expenses.</small></footer>
  </main>;
}
