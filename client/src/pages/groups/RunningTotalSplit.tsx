import { useMemo, useState } from 'react';
import arrowLeft from '../../assets/expense-arrow-left.svg';
import Avatar from '../../components/common/Avatar';
import { formatCents } from '../expenses/split';
import './runningTotal.css';

export type RunningTotalMember = { id: string; name: string; color?: string };
export type RunningTotalMethod = 'suggested' | 'equal' | 'percentage' | 'exact';
export type RunningTotalResult = {
  method: RunningTotalMethod;
  shares: { memberId: string; cents: number }[];
};

type Step = 'method' | 'review' | 'saved';

function allocate(amount: number, weights: number[]) {
  const safeWeights = weights.map(weight => Math.max(0, Math.round(weight)));
  const weightTotal = safeWeights.reduce((sum, weight) => sum + weight, 0);
  if (!weightTotal) return safeWeights.map(() => 0);
  const raw = safeWeights.map(weight => amount * weight / weightTotal);
  const shares = raw.map(value => Math.floor(value));
  let remainder = amount - shares.reduce((sum, share) => sum + share, 0);
  const order = raw.map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const item of order) {
    if (!remainder) break;
    shares[item.index] = (shares[item.index] ?? 0) + 1;
    remainder--;
  }
  return shares;
}

function equalPercentages(count: number) {
  if (!count) return [];
  const base = Math.floor(100 / count);
  return Array.from({ length: count }, (_, index) => base + (index < 100 - base * count ? 1 : 0));
}

function centsFromInput(value: string) {
  if (!/^\d+(?:\.\d{0,2})?$/.test(value.trim())) return null;
  const cents = Math.round(Number(value) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

export default function RunningTotalSplit({ groupName, totalCents, members, activityWeights = {}, onBack, onDone }: {
  groupName: string;
  totalCents: number;
  members: RunningTotalMember[];
  activityWeights?: Record<string, number>;
  onBack: () => void;
  onDone: (result: RunningTotalResult) => void;
}) {
  const [step, setStep] = useState<Step>('method');
  const [method, setMethod] = useState<RunningTotalMethod>('suggested');
  const [values, setValues] = useState<Record<string, string>>({});
  const activityTotal = members.reduce((sum, member) => sum + Math.max(activityWeights[member.id] ?? 0, 0), 0);
  const suggestedUsesActivity = activityTotal > 0;

  const startReview = (nextMethod: RunningTotalMethod) => {
    setMethod(nextMethod);
    if (nextMethod === 'percentage') {
      const percentages = equalPercentages(members.length);
      setValues(Object.fromEntries(members.map((member, index) => [member.id, String(percentages[index] ?? 0)])));
    } else if (nextMethod === 'exact') {
      const amounts = allocate(totalCents, members.map(() => 1));
      setValues(Object.fromEntries(members.map((member, index) => [member.id, ((amounts[index] ?? 0) / 100).toFixed(2)])));
    } else {
      setValues({});
    }
    setStep('review');
  };

  const calculation = useMemo(() => {
    let cents: number[];
    let valid = members.length > 0 && totalCents > 0;
    let remainingText = '';

    if (method === 'exact') {
      const parsed = members.map(member => centsFromInput(values[member.id] ?? ''));
      valid = valid && parsed.every(value => value !== null);
      cents = parsed.map(value => value ?? 0);
      const remaining = totalCents - cents.reduce((sum, value) => sum + value, 0);
      valid = valid && remaining === 0;
      remainingText = remaining === 0 ? 'Fully allocated' : `${formatCents(Math.abs(remaining))} ${remaining > 0 ? 'left to assign' : 'over total'}`;
    } else if (method === 'percentage') {
      const percentages = members.map(member => Number(values[member.id] ?? ''));
      const percentTotal = percentages.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
      valid = valid && percentages.every(value => Number.isFinite(value) && value >= 0 && value <= 100)
        && Math.abs(percentTotal - 100) < 0.001;
      cents = allocate(totalCents, percentages.map(value => Number.isFinite(value) ? Math.round(value * 100) : 0));
      const remaining = 100 - percentTotal;
      remainingText = Math.abs(remaining) < 0.001 ? '100% allocated' : `${Math.abs(remaining).toFixed(1)}% ${remaining > 0 ? 'left to assign' : 'over total'}`;
    } else {
      const weights = method === 'suggested' && suggestedUsesActivity
        ? members.map(member => activityWeights[member.id] ?? 0)
        : members.map(() => 1);
      cents = allocate(totalCents, weights);
      remainingText = method === 'suggested' && suggestedUsesActivity
        ? 'Based on recorded item participation'
        : 'Split evenly across all members';
    }

    return {
      valid,
      remainingText,
      shares: members.map((member, index) => ({ memberId: member.id, cents: cents[index] ?? 0 })),
    };
  }, [activityWeights, members, method, suggestedUsesActivity, totalCents, values]);

  const methodTitle = method === 'suggested' ? 'Suggested split' : method === 'equal' ? 'Equal split'
    : method === 'percentage' ? 'Split by percentage' : 'Exact amounts';
  const youShare = calculation.shares.find(share => share.memberId === 'you')?.cents ?? 0;

  if (step === 'saved') return <main className="running-split-screen">
    <header className="running-split-header"><button type="button" aria-label="Back to review" onClick={() => setStep('review')}><img src={arrowLeft} alt="" /></button>
      <h1>Current total split</h1></header>
    <div className="running-split-body saved">
      <span className="running-split-check" aria-hidden="true">✓</span>
      <h2>{formatCents(totalCents)} allocated</h2>
      <p>{groupName} · {methodTitle}</p>
      <section className="running-split-summary" aria-label="Saved shares">
        {calculation.shares.map(share => {
          const member = members.find(item => item.id === share.memberId)!;
          return <div key={share.memberId}><span>{member.id === 'you' ? 'You' : member.name}</span><strong>{formatCents(share.cents)}</strong></div>;
        })}
      </section>
      <p className="running-split-note">This records who is responsible for the current total. It does not move money or mark payments as settled.</p>
    </div>
    <footer className="running-split-footer"><button className="primary-button" type="button" onClick={() => onDone({ method, shares: calculation.shares })}>Back to group</button></footer>
  </main>;

  if (step === 'review') return <main className="running-split-screen">
    <header className="running-split-header"><button type="button" aria-label="Back to split methods" onClick={() => setStep('method')}><img src={arrowLeft} alt="" /></button>
      <div><h1>Review split</h1><p>{methodTitle}</p></div></header>
    <div className="running-split-body">
      <section className="running-total-card"><small>CURRENT RUNNING TOTAL</small><strong>{formatCents(totalCents)}</strong><span>{groupName}</span></section>
      <div className="running-split-status"><span>{calculation.remainingText}</span><strong>Your share {formatCents(youShare)}</strong></div>
      <section className="running-share-list" aria-label="Member shares">
        {calculation.shares.map((share, index) => {
          const member = members[index]!;
          const editable = method === 'percentage' || method === 'exact';
          return <div className="running-share-row" key={member.id}>
            <Avatar name={member.id === 'you' ? 'Vivian' : member.name} color={member.color} />
            <span><strong>{member.id === 'you' ? 'You' : member.name}</strong><small>{editable ? (method === 'percentage' ? 'Percentage of total' : 'Exact responsibility') : methodTitle}</small></span>
            {editable ? <label className="running-share-input">
              {method === 'exact' && <span>$</span>}
              <input aria-label={`${member.id === 'you' ? 'You' : member.name} ${method === 'percentage' ? 'percentage' : 'amount'}`}
                inputMode="decimal" value={values[member.id] ?? ''} onChange={event => setValues(previous => ({ ...previous, [member.id]: event.target.value }))} />
              {method === 'percentage' && <span>%</span>}
            </label> : <strong>{formatCents(share.cents)}</strong>}
          </div>;
        })}
      </section>
      <button className="running-change-method" type="button" onClick={() => setStep('method')}>Choose a different method</button>
    </div>
    <footer className="running-split-footer"><button className="primary-button" type="button" disabled={!calculation.valid} onClick={() => setStep('saved')}>
      Confirm split</button></footer>
  </main>;

  const methods: { key: RunningTotalMethod; title: string; description: string; badge?: string }[] = [
    { key: 'suggested', title: 'Suggested split', badge: 'Recommended', description: suggestedUsesActivity
      ? 'Uses the item participation already recorded in this group.' : 'No item history yet, so this starts with an equal split.' },
    { key: 'equal', title: 'Split equally', description: 'Divide the total evenly, including any leftover cents.' },
    { key: 'percentage', title: 'Use percentages', description: 'Set a percentage for each person; the total must equal 100%.' },
    { key: 'exact', title: 'Enter exact amounts', description: 'Choose the exact amount each member is responsible for.' },
  ];

  return <main className="running-split-screen">
    <header className="running-split-header"><button type="button" aria-label="Back to group" onClick={onBack}><img src={arrowLeft} alt="" /></button>
      <div><h1>Split current total</h1><p>{groupName}</p></div></header>
    <div className="running-split-body">
      <section className="running-total-card"><small>CURRENT RUNNING TOTAL</small><strong>{formatCents(totalCents)}</strong>
        <span>{members.length} people included</span></section>
      <h2>How should this be split?</h2>
      <div className="running-method-list">
        {methods.map(item => <button type="button" key={item.key} onClick={() => startReview(item.key)}>
          <span><strong>{item.title}</strong>{item.badge && <b>{item.badge}</b>}<small>{item.description}</small></span><span aria-hidden="true">›</span>
        </button>)}
      </div>
      <p className="running-split-note">You can review every share before confirming. Nothing is sent automatically.</p>
    </div>
  </main>;
}
