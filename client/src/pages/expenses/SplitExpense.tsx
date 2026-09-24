import { useState } from 'react';
import Avatar from '../../components/common/Avatar';
import arrowLeft from '../../assets/expense-arrow-left.svg';
import { calculateSplit, formatCents, type PreviewSplit, type SplitAssignments, type SplitItem, type SplitMember, type SplitMode } from './split';
import './split.css';

type Props = {
  name: string; items: SplitItem[]; feeCents: number; members: SplitMember[]; payerId: string; date: string;
  mode: SplitMode; assignments: SplitAssignments;
  onModeChange: (mode: SplitMode) => void;
  onAssignmentsChange: (assignments: SplitAssignments) => void;
  onBack: () => void; onConfirm: (split: PreviewSplit) => void;
};
export default function SplitExpense(props: Props) {
  const { name, items, feeCents, members, payerId, date, mode, assignments, onModeChange, onAssignmentsChange, onBack, onConfirm } = props;
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const selectedMember = members.find(member => member.id === selectedMemberId);
  const [confirming, setConfirming] = useState(false);
  const result = calculateSplit(items, feeCents, members, payerId, mode, assignments);
  const memberName = (member: SplitMember) => member.id === 'you' ? 'Vivian' : member.name.split(' ')[0] ?? member.name;
  const payer = members.find(member => member.id === payerId)!;
  const avatar = (member: SplitMember, index: number) => <span className={`split-avatar tone-${index % 4}`} aria-hidden="true"><Avatar name={memberName(member)} /></span>;
  const toggle = (itemId: number, memberId: string) => {
    const current = assignments[itemId] ?? [];
    onAssignmentsChange({ ...assignments, [itemId]: current.includes(memberId) ? current.filter(id => id !== memberId) : [...current, memberId] });
  };
  return <main className="expense-screen split-screen">
    <header className="expense-header"><button type="button" aria-label="Back to expense" onClick={onBack}><img src={arrowLeft} alt="" /></button><h1>Split expense</h1></header>
    <div className="expense-body split-body">
      <section className="split-context"><h2>{name}</h2><div><p>Paid by {payerId === 'you' ? 'you' : memberName(payer)} · {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p><strong>{formatCents(result.totalCents)} total</strong></div></section>
      <div className="split-modes" role="group" aria-label="Split mode"><button type="button" aria-pressed={mode === 'equal'} onClick={() => onModeChange('equal')}>Equal split</button><button type="button" aria-pressed={mode === 'items'} onClick={() => onModeChange('items')}>Split by item</button></div>
      {mode === 'items' && <section className="split-legend"><p>Tap avatars to assign / unassign</p><div>{members.map((member, index) => <button type="button" key={member.id} aria-label={`Select ${memberName(member)} to assign items`} aria-pressed={selectedMemberId === member.id} onClick={() => setSelectedMemberId(previous => previous === member.id ? null : member.id)}>{avatar(member, index)}{memberName(member)}</button>)}</div><p className="split-selection-hint" aria-live="polite">{selectedMember ? `Tap receipt items to assign or unassign ${memberName(selectedMember)}. Highlighted items include them.` : 'Select a name, then tap receipt items. Or use the avatars on each item.'}</p></section>}
      <section className="split-items"><h2>Receipt Items</h2>{items.map(item => {
        const count = members.filter(member => assignments[item.id]?.includes(member.id)).length;
        const lower = count ? Math.floor(item.cents / count) : 0;
        const upper = count ? Math.ceil(item.cents / count) : 0;
        const amount = lower === upper ? `${formatCents(lower)} ea` : `${formatCents(lower)}–${formatCents(upper)} ea`;
        return <div className={`split-item ${mode === 'items' && selectedMember && assignments[item.id]?.includes(selectedMember.id) ? 'selected-member-item' : ''}`} key={item.id}>
          {mode === 'items' && selectedMember && <button className="split-item-target" type="button" aria-label={`Assign ${item.name} to ${memberName(selectedMember)}`} aria-pressed={assignments[item.id]?.includes(selectedMember.id) ?? false} onClick={() => toggle(item.id, selectedMember.id)} />}
          <div className="split-item-title"><strong>{item.name}</strong><b>{formatCents(item.cents)}</b></div>
          {mode === 'items' && <div className="split-assignment"><p>{!count ? 'Assign at least one member' : count === members.length ? `Shared by everyone (${amount})` : `Split ${count} ${count === 1 ? 'way' : 'ways'} (${amount})`}</p>
            <div role="group" aria-label={`Assign ${item.name}`}>{members.map((member, index) => <button type="button" key={member.id} aria-label={`${memberName(member)} for ${item.name}`} aria-pressed={assignments[item.id]?.includes(member.id) ?? false} onClick={() => toggle(item.id, member.id)}>{avatar(member, index)}</button>)}</div>
          </div>}
        </div>;
      })}<div className="split-fees"><p>Tax, tip &amp; fees · {mode === 'equal' ? 'Equal split' : 'Proportional split'}</p><b>{formatCents(feeCents)}</b></div></section>
      {mode === 'equal' && <h2 className="split-final-heading">Final shares · Includes fees</h2>}
      <section className="split-summary" aria-label="Calculated Split Shares" aria-live="polite"><h2>Calculated Split Shares</h2>{result.shares.map((share, index) => {
        const member = members[index]!;
        return <div className="split-share" key={member.id}>{avatar(member, index)}<span>{memberName(member)}{mode === 'items' ? ` (${formatCents(share.baseCents)} base)` : member.id === 'you' ? ' (you)' : ''}{mode === 'equal' && member.id === payerId ? ' · Paid' : ''}</span><strong>{formatCents(share.totalCents)}</strong></div>;
      })}</section>
      {!result.valid && <p className="form-notice" role="status">Assign every item to at least one member before confirming. Fees and final shares will update once all items are assigned.</p>}
    </div>
    <footer className="expense-footer split-footer"><button className="primary-button" type="button" disabled={!result.valid || confirming} onClick={() => {
      if (!result.valid || confirming) return;
      setConfirming(true);
      onConfirm({ name, payerId, date, mode, items, feeCents, totalCents: result.totalCents, assignments, shares: result.shares });
    }}>Confirm and split {formatCents(result.totalCents)}</button><small>{mode === 'items' ? 'Fees split proportionally · ' : 'Other members reimburse '}{payerId === 'you' ? (mode === 'items' ? 'Reimburse you.' : 'you for their share.') : mode === 'items' ? `Reimburse ${memberName(payer)}.` : `${memberName(payer)} for their share.`}</small></footer>
  </main>;
}
