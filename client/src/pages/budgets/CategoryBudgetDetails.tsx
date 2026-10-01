import Avatar from '../../components/common/Avatar';
import { formatCents } from '../expenses/split';
import { useState } from 'react';
import { CATEGORY_TRANSACTIONS, DAYS_LEFT, categoryInsights, categoryPct, totalSpentCents, totalPlannedCents, type CategoryBudget } from './categoryPlan';
import { remainingOwedCents, settlementKey, settlementsFor, type GroupBudget } from './groupBudgetPlan';

const Back = ({ label, onBack }: { label: string; onBack: () => void }) =>
  <button type="button" className="cb-back" onClick={onBack}>‹ {label}</button>;

export function CategoryTransactions({ item, onBack }: { item: CategoryBudget; onBack: () => void }) {
  const transactions = CATEGORY_TRANSACTIONS[item.key];
  const left = item.plannedCents - item.spentCents;
  return <>
    <Back label="Budget" onBack={onBack} />
    <header className="cb-header"><h1>{item.label}</h1><p>September transactions</p></header>
    <section className="cb-category" aria-label={`${item.label} summary`}>
      <div className="cb-category-head"><strong>{formatCents(item.spentCents)} spent</strong><span>of {formatCents(item.plannedCents)}</span></div>
      <div className="cb-category-bar" role="presentation"><div style={{ width: `${categoryPct(item)}%`, background: item.color }} /></div>
      <p className="cb-detail-note">{left >= 0 ? `${formatCents(left)} left in this category` : `${formatCents(-left)} over budget`}</p>
    </section>
    <h2 className="cb-section-heading">Transactions</h2>
    {transactions.map(t => <div key={t.id} className="cb-category cb-txn">
      <div className="cb-category-head"><strong>{t.merchant}</strong><span className="cb-txn-amount">{formatCents(t.amountCents)}</span></div>
      <p className="cb-detail-note">{t.dateLabel}{t.note ? ` · ${t.note}` : ''}</p>
    </div>)}
  </>;
}

export function SpendingInsights({ budgets, onBack, onSelectCategory }: { budgets: CategoryBudget[]; onBack: () => void; onSelectCategory: (key: CategoryBudget['key']) => void }) {
  const insights = categoryInsights(budgets);
  const spent = totalSpentCents(budgets);
  const planned = totalPlannedCents(budgets);
  const projected = insights.reduce((sum, i) => sum + i.projectedCents, 0);
  const top = [...insights].sort((a, b) => b.item.spentCents - a.item.spentCents)[0];
  const overPace = insights.filter(i => i.overPace);
  return <>
    <Back label="Budget" onBack={onBack} />
    <header className="cb-header"><h1>Spending insights</h1><p>September · {DAYS_LEFT} days left</p></header>
    <section className="cb-hero" aria-label="Projection">
      <strong className="cb-hero-amount">{formatCents(projected)} projected</strong>
      <p className="cb-hero-sub">{projected <= planned ? `${formatCents(planned - projected)} under` : `${formatCents(projected - planned)} over`} your {formatCents(planned)} plan at this pace</p>
      <p className="cb-hero-sub">{formatCents(spent)} spent so far</p>
    </section>
    {top && <p className="cb-notice" role="status">{top.item.label} is your biggest category at {Math.round(top.sharePct)}% of spending.</p>}
    {overPace.length > 0 && <p className="cb-notice cb-warn" role="status">
      On pace to go over: {overPace.map(i => i.item.label).join(', ')}.
    </p>}
    <h2 className="cb-section-heading">Where it went</h2>
    {insights.map(i => <button key={i.item.key} type="button" className="cb-category cb-row-button" onClick={() => onSelectCategory(i.item.key)}>
      <div className="cb-category-head"><strong>{i.item.label}</strong><span>{Math.round(i.sharePct)}% of spending</span></div>
      <div className="cb-category-bar" role="presentation"><div style={{ width: `${i.sharePct}%`, background: i.item.color }} /></div>
      <p className="cb-detail-note">{Math.round(i.usedPct)}% of budget used · projected {formatCents(i.projectedCents)}{i.overPace ? ' (over)' : ''}</p>
    </button>)}
  </>;
}

export function WhoOwesWhat({ group, settledKeys, onToggleSettled, onBack }: {
  group: GroupBudget; settledKeys: string[]; onToggleSettled: (key: string) => void; onBack: () => void;
}) {
  const settlements = settlementsFor(group);
  const owed = remainingOwedCents(group, settledKeys);
  const color = (id: string) => group.members.find(m => m.id === id)?.avatarColor ?? 'green';
  return <>
    <Back label={group.name} onBack={onBack} />
    <header className="cb-header"><h1>Who owes what</h1><p>{group.name}</p></header>
    <section className="cb-hero" aria-label="Settlement summary">
      <strong className="cb-hero-amount">{owed ? `${formatCents(owed)} left to settle` : 'All settled up'}</strong>
      <p className="cb-hero-sub">{formatCents(group.spentCents)} spent across {group.members.length} members</p>
    </section>
    <h2 className="cb-section-heading">Payments to make</h2>
    {settlements.length === 0 && <p className="cb-notice" role="status">Nobody owes anything right now.</p>}
    {settlements.map(s => <div key={`${s.fromId}-${s.toId}`} className="cb-category cb-member">
      <div className="cb-category-head">
        <span className="cb-member-name"><Avatar name={s.fromName} color={color(s.fromId)} /><strong>{s.fromName}</strong><span>→ {s.toName}</span></span>
        <span className={settledKeys.includes(settlementKey(s)) ? 'cb-settled' : 'cb-owe'}>{formatCents(s.cents)}</span>
      </div>
      <button type="button" className="cb-settle-btn" aria-label={`${settledKeys.includes(settlementKey(s)) ? 'Undo settled' : 'Mark settled'}: ${s.fromName} to ${s.toName}`}
        onClick={() => onToggleSettled(settlementKey(s))}>
        {settledKeys.includes(settlementKey(s)) ? '✓ Settled · Undo' : 'Mark as settled'}
      </button>
    </div>)}
    <h2 className="cb-section-heading">Balances</h2>
    {group.members.map(m => <div key={m.id} className="cb-category cb-member">
      <div className="cb-category-head">
        <span className="cb-member-name"><Avatar name={m.name} color={m.avatarColor} /><strong>{m.name}</strong></span>
        <span className={remainingOwedCents(group, settledKeys, m.id) ? 'cb-owe' : ''}>{m.oweCents
          ? (remainingOwedCents(group, settledKeys, m.id) ? `Owes ${formatCents(remainingOwedCents(group, settledKeys, m.id))}` : 'Settled')
          : `Paid ${formatCents(m.paidCents ?? 0)}`}</span>
      </div>
    </div>)}
    <p className="cb-notice">Settlements are recorded in the app; no money moves through it.</p>
  </>;
}

const toCents = (text: string) => {
  const n = Number(text.replace(/[$,\s]/g, ''));
  return text.trim() !== '' && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};

export function EditLimits({ budgets, onSave, onCancel }: { budgets: CategoryBudget[]; onSave: (next: CategoryBudget[]) => void; onCancel: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(budgets.map(b => [b.key, (b.plannedCents / 100).toFixed(2)])));
  const parsed = budgets.map(b => ({ b, cents: toCents(values[b.key] ?? '') }));
  const valid = parsed.every(p => p.cents !== null);
  const total = parsed.reduce((sum, p) => sum + (p.cents ?? 0), 0);
  return <>
    <Back label="Budget" onBack={onCancel} />
    <header className="cb-header"><h1>Edit limits</h1><p>Set a monthly limit for each category</p></header>
    <form onSubmit={event => { event.preventDefault(); if (valid) onSave(parsed.map(p => ({ ...p.b, plannedCents: p.cents ?? p.b.plannedCents }))); }}>
      {parsed.map(({ b, cents }) => <label key={b.key} className="cb-category cb-limit-row">
        <span className="cb-category-head"><strong>{b.label}</strong><span>{formatCents(b.spentCents)} spent</span></span>
        <input inputMode="decimal" aria-label={`${b.label} limit`} value={values[b.key] ?? ''} aria-invalid={cents === null}
          onChange={event => setValues({ ...values, [b.key]: event.target.value })} />
        {cents === null && <span className="cb-field-error">Enter an amount of $0 or more.</span>}
        {cents !== null && cents < b.spentCents && <span className="cb-field-error">Already {formatCents(b.spentCents - cents)} over this limit.</span>}
      </label>)}
      <p className="cb-notice">Total planned: {formatCents(total)}</p>
      <div className="cb-actions">
        <button type="button" className="cb-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="cb-primary" disabled={!valid}>Save limits</button>
      </div>
    </form>
  </>;
}
