import Avatar from '../../components/common/Avatar';
import { ApiError } from '../../api/client';
import { formatCents } from '../expenses/split';
import { useState } from 'react';
import { MAX_LIMIT_CENTS, categoryInsights, categoryPct, totalSpentCents, totalPlannedCents, type BudgetPeriod, type CategoryBudget, type CategoryKey, type CategoryTransaction } from './categoryPlan';
import { settlementsFor, totalOwedCents, type GroupBudget } from './groupBudgetPlan';

const Back = ({ label, onBack }: { label: string; onBack: () => void }) =>
  <button type="button" className="cb-back" onClick={onBack}>‹ {label}</button>;

const errorMessage = (error: unknown) => error instanceof ApiError ? error.message : 'Unable to reach the server. Try again.';

export function CategoryTransactions({ item, transactions, period, onBack }: { item: CategoryBudget; transactions: CategoryTransaction[]; period: BudgetPeriod; onBack: () => void }) {
  const left = item.plannedCents - item.spentCents;
  return <>
    <Back label="Budget" onBack={onBack} />
    <header className="cb-header"><h1>{item.label}</h1><p>{period.monthLabel} transactions</p></header>
    <section className="cb-category" aria-label={`${item.label} summary`}>
      <div className="cb-category-head"><strong>{formatCents(item.spentCents)} spent</strong><span>of {formatCents(item.plannedCents)}</span></div>
      <div className="cb-category-bar" role="presentation"><div style={{ width: `${categoryPct(item)}%`, background: item.color }} /></div>
      <p className="cb-detail-note">{item.plannedCents === 0 ? 'No limit set for this category' : left >= 0 ? `${formatCents(left)} left in this category` : `${formatCents(-left)} over budget`}</p>
    </section>
    <h2 className="cb-section-heading">Transactions</h2>
    {transactions.length === 0 && <p className="cb-notice" role="status">No transactions in this category yet this month.</p>}
    {transactions.map(t => <div key={t.id} className="cb-category cb-txn">
      <div className="cb-category-head"><strong>{t.merchant}</strong><span className="cb-txn-amount">{formatCents(t.amountCents)}</span></div>
      <p className="cb-detail-note">{t.dateLabel}{t.pending ? ' · Pending' : ''}</p>
    </div>)}
  </>;
}

export function SpendingInsights({ budgets, period, onBack, onSelectCategory }: { budgets: CategoryBudget[]; period: BudgetPeriod; onBack: () => void; onSelectCategory: (key: CategoryBudget['key']) => void }) {
  const insights = categoryInsights(budgets, period.daysLeft, period.daysInMonth);
  const spent = totalSpentCents(budgets);
  const planned = totalPlannedCents(budgets);
  const projected = insights.reduce((sum, i) => sum + i.projectedCents, 0);
  const top = [...insights].sort((a, b) => b.item.spentCents - a.item.spentCents)[0];
  const overPace = insights.filter(i => i.overPace);
  return <>
    <Back label="Budget" onBack={onBack} />
    <header className="cb-header"><h1>Spending insights</h1><p>{period.monthLabel} · {period.daysLeft} days left</p></header>
    <section className="cb-hero" aria-label="Projection">
      <strong className="cb-hero-amount">{formatCents(projected)} projected</strong>
      <p className="cb-hero-sub">{planned === 0 ? 'Set category limits to compare against a plan' : `${projected <= planned ? `${formatCents(planned - projected)} under` : `${formatCents(projected - planned)} over`} your ${formatCents(planned)} plan at this pace`}</p>
      <p className="cb-hero-sub">{formatCents(spent)} spent so far</p>
    </section>
    {top && top.item.spentCents > 0 && <p className="cb-notice" role="status">{top.item.label} is your biggest category at {Math.round(top.sharePct)}% of spending.</p>}
    {overPace.length > 0 && <p className="cb-notice cb-warn" role="status">
      On pace to go over: {overPace.map(i => i.item.label).join(', ')}.
    </p>}
    <h2 className="cb-section-heading">Where it went</h2>
    {insights.map(i => <button key={i.item.key} type="button" className="cb-category cb-row-button" onClick={() => onSelectCategory(i.item.key)}>
      <div className="cb-category-head"><strong>{i.item.label}</strong><span>{Math.round(i.sharePct)}% of spending</span></div>
      <div className="cb-category-bar" role="presentation"><div style={{ width: `${i.sharePct}%`, background: i.item.color }} /></div>
      <p className="cb-detail-note">{i.item.plannedCents ? `${Math.round(i.usedPct)}% of budget used` : 'No limit set'} · projected {formatCents(i.projectedCents)}{i.overPace ? ' (over)' : ''}</p>
    </button>)}
  </>;
}

export function WhoOwesWhat({ group, onBack }: { group: GroupBudget; onBack: () => void }) {
  const settlements = settlementsFor(group);
  const owed = totalOwedCents(group);
  const color = (id: string) => group.members.find(m => m.id === id)?.avatarColor ?? 'green';
  return <>
    <Back label={group.name} onBack={onBack} />
    <header className="cb-header"><h1>Who owes what</h1><p>{group.name}</p></header>
    <section className="cb-hero" aria-label="Settlement summary">
      <strong className="cb-hero-amount">{owed ? `${formatCents(owed)} left to settle` : 'All settled up'}</strong>
      <p className="cb-hero-sub">{formatCents(group.spentCents)} spent this month across {group.members.length} members</p>
    </section>
    <h2 className="cb-section-heading">Payments to make</h2>
    {settlements.length === 0 && <p className="cb-notice" role="status">Nobody owes anything right now.</p>}
    {settlements.map(s => <div key={`${s.fromId}-${s.toId}`} className="cb-category cb-member">
      <div className="cb-category-head">
        <span className="cb-member-name"><Avatar name={s.fromName} color={color(s.fromId)} /><strong>{s.fromName}</strong><span>→ {s.toName}</span></span>
        <span className="cb-owe">{formatCents(s.cents)}</span>
      </div>
    </div>)}
    <h2 className="cb-section-heading">Balances</h2>
    {group.members.map(m => <div key={m.id} className="cb-category cb-member">
      <div className="cb-category-head">
        <span className="cb-member-name"><Avatar name={m.name} color={m.avatarColor} /><strong>{m.name}</strong></span>
        <span className={m.oweCents ? 'cb-owe' : ''}>{m.oweCents ? `Owes ${formatCents(m.oweCents)}` : m.creditCents ? `Owed ${formatCents(m.creditCents)}` : 'Settled'}</span>
      </div>
    </div>)}
    <p className="cb-notice">Balances come from the group's expenses and confirmed payments. To settle up, report and confirm payments from the group's expenses; no money moves through the app.</p>
  </>;
}

// Parses a dollar amount into cents; null when blank, negative, not a number, or above the maximum.
const toCents = (text: string) => {
  const n = Number(text.replace(/[$,\s]/g, ''));
  const cents = Math.round(n * 100);
  return text.trim() !== '' && Number.isFinite(n) && n >= 0 && cents <= MAX_LIMIT_CENTS ? cents : null;
};
const AMOUNT_ERROR = 'Enter an amount between $0 and $1,000,000.';

export function EditLimits({ budgets, onSave, onCancel }: { budgets: CategoryBudget[]; onSave: (limits: Record<CategoryKey, number>) => Promise<void>; onCancel: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(budgets.map(b => [b.key, (b.plannedCents / 100).toFixed(2)])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const parsed = budgets.map(b => ({ b, cents: toCents(values[b.key] ?? '') }));
  const valid = parsed.every(p => p.cents !== null);
  const total = parsed.reduce((sum, p) => sum + (p.cents ?? 0), 0);
  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true); setError('');
    try { await onSave(Object.fromEntries(parsed.map(p => [p.b.key, p.cents ?? p.b.plannedCents])) as Record<CategoryKey, number>); }
    catch (failure) { setError(errorMessage(failure)); setSaving(false); }
  };
  return <>
    <Back label="Budget" onBack={onCancel} />
    <header className="cb-header"><h1>Edit limits</h1><p>Set a monthly limit for each category. Use $0 for no limit.</p></header>
    <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      {parsed.map(({ b, cents }) => <label key={b.key} className="cb-category cb-limit-row">
        <span className="cb-category-head"><strong>{b.label}</strong><span>{formatCents(b.spentCents)} spent</span></span>
        <input inputMode="decimal" aria-label={`${b.label} limit`} value={values[b.key] ?? ''} aria-invalid={cents === null}
          onChange={event => setValues({ ...values, [b.key]: event.target.value })} />
        {cents === null && <span className="cb-field-error">{AMOUNT_ERROR}</span>}
        {cents !== null && cents > 0 && cents < b.spentCents && <span className="cb-field-error">Already {formatCents(b.spentCents - cents)} over this limit.</span>}
      </label>)}
      <p className="cb-notice">Total planned: {formatCents(total)}</p>
      {error && <p className="cb-notice cb-warn" role="alert">{error}</p>}
      <div className="cb-actions">
        <button type="button" className="cb-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="cb-primary" disabled={!valid || saving}>{saving ? 'Saving…' : 'Save limits'}</button>
      </div>
    </form>
  </>;
}

export function EditGroupPlan({ group, onSave, onCancel }: { group: GroupBudget; onSave: (plannedCents: number) => Promise<void>; onCancel: () => void }) {
  const [value, setValue] = useState((group.plannedCents / 100).toFixed(2));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const cents = toCents(value);
  const submit = async () => {
    if (cents === null || saving) return;
    setSaving(true); setError('');
    try { await onSave(cents); }
    catch (failure) { setError(errorMessage(failure)); setSaving(false); }
  };
  return <>
    <Back label={group.name} onBack={onCancel} />
    <header className="cb-header"><h1>Shared plan</h1><p>Monthly budget for {group.name}. Use $0 for no plan.</p></header>
    <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      <label className="cb-category cb-limit-row">
        <span className="cb-category-head"><strong>Monthly plan</strong><span>{formatCents(group.spentCents)} spent this month</span></span>
        <input inputMode="decimal" aria-label="Shared plan" value={value} aria-invalid={cents === null} onChange={event => setValue(event.target.value)} />
        {cents === null && <span className="cb-field-error">{AMOUNT_ERROR}</span>}
        {cents !== null && cents > 0 && cents < group.spentCents && <span className="cb-field-error">Already {formatCents(group.spentCents - cents)} over this plan.</span>}
      </label>
      {error && <p className="cb-notice cb-warn" role="alert">{error}</p>}
      <div className="cb-actions">
        <button type="button" className="cb-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="cb-primary" disabled={cents === null || saving}>{saving ? 'Saving…' : 'Save plan'}</button>
      </div>
    </form>
  </>;
}
