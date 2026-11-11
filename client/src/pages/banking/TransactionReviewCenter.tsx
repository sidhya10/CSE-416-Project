import { usePullRefresh } from '../../hooks/usePullRefresh';
import { useEffect, useMemo, useRef, useState } from 'react';
import { bankingApi, type ApiBankTransaction, type BankBudgetCategory, type BankReviewCategory, type TransactionReview } from '../../api/banking.api';
import { ApiError } from '../../api/client';
import { formatCents } from '../expenses/split';

const CATEGORIES: { key: BankBudgetCategory; label: string }[] = [
  { key: 'dining', label: 'Dining' }, { key: 'groceries', label: 'Groceries' },
  { key: 'transit', label: 'Transit' }, { key: 'shopping', label: 'Shopping' }, { key: 'other', label: 'Other' },
];
type Filter = 'unreviewed' | 'excluded' | 'all';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'unreviewed', label: 'Needs category' }, { key: 'excluded', label: 'Excluded' },
];
const labelFor = (key: BankReviewCategory | null) => key === 'income' ? 'Income' : CATEGORIES.find(item => item.key === key)?.label ?? 'Not categorized';
const message = (error: unknown) => error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Unable to load transactions.';
const dollars = (cents: number) => (cents / 100).toFixed(2);
const cents = (value: string) => {
  if (!/^\d+(?:\.\d{0,2})?$/.test(value.trim())) return null;
  const result = Math.round(Number(value) * 100);
  return Number.isSafeInteger(result) && result > 0 ? result : null;
};

function ReviewEditor({ transaction, onCancel, onSaved }: { transaction: ApiBankTransaction; onCancel: () => void; onSaved: (transaction: ApiBankTransaction) => void }) {
  const [category, setCategory] = useState<BankBudgetCategory>(CATEGORIES.some(item => item.key === transaction.category) ? transaction.category as BankBudgetCategory : 'other');
  const [income, setIncome] = useState(transaction.category === 'income');
  const [excluded, setExcluded] = useState(transaction.excluded);
  const [note, setNote] = useState(transaction.note ?? '');
  const [split, setSplit] = useState(transaction.splits.length > 0);
  const [parts, setParts] = useState(() => transaction.splits.length
    ? transaction.splits.map(item => ({ category: item.category, amount: dollars(item.amountCents) }))
    : [{ category: 'dining' as BankBudgetCategory, amount: '' }, { category: 'other' as BankBudgetCategory, amount: '' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const parsed = parts.map(part => ({ category: part.category, amountCents: cents(part.amount) }));
  const splitTotal = parsed.reduce((sum, part) => sum + (part.amountCents ?? 0), 0);
  const duplicateCategory = new Set(parts.map(part => part.category)).size !== parts.length;
  const validSplit = !split || (transaction.amountCents > 0 && parsed.every(part => part.amountCents !== null) && splitTotal === transaction.amountCents && !duplicateCategory);
  const save = async (reviewed: boolean) => {
    if (saving || !validSplit) return;
    setSaving(true); setError('');
    const review: TransactionReview = {
      category: transaction.amountCents <= 0 ? (income ? 'income' : null) : split ? null : category,
      excluded,
      note: note.trim() || null,
      reviewed,
      splits: split ? parsed.map(part => ({ category: part.category, amountCents: part.amountCents! })) : [],
    };
    try { onSaved((await bankingApi.reviewTransaction(transaction.id, review)).transaction); }
    catch (failure) { setError(message(failure)); setSaving(false); }
  };
  return <div className="bank-dialog-backdrop" onKeyDown={event => { if (event.key === 'Escape' && !saving) onCancel(); }}>
    <div className="bank-dialog transaction-review-dialog" role="dialog" aria-modal="true" aria-labelledby="review-transaction-title">
      <header><div><h2 id="review-transaction-title">Review transaction</h2><p>{transaction.merchant} · {formatCents(transaction.amountCents)}</p></div>
        <button type="button" aria-label="Close" disabled={saving} onClick={onCancel}>×</button></header>
      {transaction.linkedExpense && <p className="bank-linked-notice">Linked to “{transaction.linkedExpense.title}” in {transaction.linkedExpense.groupName}. Your personal budget counts <strong>{formatCents(transaction.linkedExpense.personalBudgetCents ?? 0)}</strong> instead of the original {formatCents(transaction.amountCents)} bank charge.</p>}
      <label className="review-check"><input type="checkbox" checked={excluded} disabled={saving || !!transaction.linkedExpense} onChange={event => { setExcluded(event.target.checked); if (event.target.checked) setSplit(false); }} />
        <span><strong>Exclude from budget</strong><small>Use for transfers, reimbursements, and duplicate charges.</small></span></label>
      <label>CATEGORY<select value={category} disabled={saving || split || excluded || transaction.amountCents <= 0 || !!transaction.linkedExpense} onChange={event => setCategory(event.target.value as BankBudgetCategory)}>
        {CATEGORIES.map(item => <option value={item.key} key={item.key}>{item.label}</option>)}
      </select></label>
      {transaction.amountCents <= 0 && <><label className="review-check"><input type="checkbox" checked={income} disabled={saving || excluded} onChange={event => setIncome(event.target.checked)} />
        <span><strong>Count as income</strong><small>Turn this on for paychecks and other earned income. Leave refunds and transfers off.</small></span></label>
        <p className="bank-caption">Deposits and refunds never count as spending. Only deposits marked as income appear in the income chart.</p></>}
      {transaction.amountCents > 0 && !transaction.linkedExpense && <label className="review-check"><input type="checkbox" checked={split} disabled={saving || excluded} onChange={event => setSplit(event.target.checked)} />
        <span><strong>Split across categories</strong><small>Every part must add up to {formatCents(transaction.amountCents)}.</small></span></label>}
      {split && !excluded && <div className="review-splits">
        {parts.map((part, index) => <div className="review-split-row" key={index}>
          <select aria-label={`Split ${index + 1} category`} value={part.category} disabled={saving} onChange={event => setParts(parts.map((item, i) => i === index ? { ...item, category: event.target.value as BankBudgetCategory } : item))}>
            {CATEGORIES.map(item => <option value={item.key} key={item.key}>{item.label}</option>)}
          </select>
          <span>$</span><input aria-label={`Split ${index + 1} amount`} inputMode="decimal" placeholder="0.00" value={part.amount} disabled={saving} onChange={event => setParts(parts.map((item, i) => i === index ? { ...item, amount: event.target.value } : item))} />
          {parts.length > 2 && <button type="button" aria-label={`Remove split ${index + 1}`} disabled={saving} onClick={() => setParts(parts.filter((_, i) => i !== index))}>−</button>}
        </div>)}
        {parts.length < CATEGORIES.length && <button className="review-add-split" type="button" disabled={saving} onClick={() => {
          const unused = CATEGORIES.find(item => !parts.some(part => part.category === item.key))?.key ?? 'other';
          setParts([...parts, { category: unused, amount: '' }]);
        }}>+ Add category</button>}
        <p className={validSplit ? 'review-total valid' : 'review-total'}>{formatCents(splitTotal)} of {formatCents(transaction.amountCents)} allocated{duplicateCategory ? ' · choose each category once' : ''}</p>
      </div>}
      <label>NOTE<textarea maxLength={500} value={note} disabled={saving} placeholder="Optional note" onChange={event => setNote(event.target.value)} /></label>
      {error && <p className="form-notice" role="alert">{error}</p>}
      <div className="review-dialog-actions">
        <button type="button" disabled={saving} onClick={onCancel}>Cancel</button>
        <button type="button" disabled={saving || !validSplit} onClick={() => void save(true)}>{saving ? 'Saving…' : 'Save changes'}</button>
      </div>
    </div>
  </div>;
}

export default function TransactionReviewCenter({ onBack, onUnreviewedDelta, initialMonth }: { onBack: () => void; onUnreviewedDelta?: (delta: number) => void; initialMonth?: string }) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthOptions = Array.from({ length: 25 }, (_, index) => {
    const date = new Date(`${currentMonth}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() - index);
    return { value: date.toISOString().slice(0, 7), label: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
  });
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [month, setMonth] = useState(initialMonth || currentMonth);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [transactions, setTransactions] = useState<ApiBankTransaction[]>([]);
  const [selected, setSelected] = useState<ApiBankTransaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const requestKey = useMemo(() => `${filter}:${month}:${query.trim()}`, [filter, month, query]);

  useEffect(() => {
    if (!filtersOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!filterMenuRef.current?.contains(event.target as Node)) setFiltersOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setFiltersOpen(false); };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('pointerdown', closeOnOutsideClick); document.removeEventListener('keydown', closeOnEscape); };
  }, [filtersOpen]);

  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(() => {
      setLoading(true); setError('');
      bankingApi.transactions(filter, query, month).then(result => { if (active) setTransactions(result.transactions); })
        .catch(failure => { if (active) setError(message(failure)); })
        .finally(() => { if (active) setLoading(false); });
    }, query.trim() ? 250 : 0);
    return () => { active = false; window.clearTimeout(timeout); };
  }, [requestKey]);

  usePullRefresh(async () => {
    const result = await bankingApi.transactions(filter, query, month);
    setTransactions(result.transactions);
  });
  const saved = (transaction: ApiBankTransaction) => {
    const wasUnreviewed = !!selected && !selected.reviewed && !selected.excluded;
    const isUnreviewed = !transaction.reviewed && !transaction.excluded;
    if (wasUnreviewed !== isUnreviewed) onUnreviewedDelta?.(isUnreviewed ? 1 : -1);
    setSelected(null);
    const belongs = filter === 'all' || filter === 'excluded' && transaction.excluded
      || filter === 'unreviewed' && !transaction.reviewed && !transaction.excluded;
    setTransactions(previous => belongs ? previous.map(item => item.id === transaction.id ? transaction : item) : previous.filter(item => item.id !== transaction.id));
  };

  return <main className="banking-workspace review-workspace">
    <header className="bank-header"><button type="button" aria-label="Back" onClick={onBack}>‹</button>
      <div><h1>Transactions</h1><p>{monthOptions.find(item => item.value === month)?.label ?? month}</p></div></header>
    <div className="review-toolbar">
      <input className="review-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search merchant, account, or note" aria-label="Search transactions" />
      <div className="review-filter-menu" ref={filterMenuRef}>
        <button type="button" className={filtersOpen || filter !== 'all' ? 'review-filter-toggle active' : 'review-filter-toggle'} aria-label="Filter transactions" aria-expanded={filtersOpen} aria-haspopup="dialog" onClick={() => setFiltersOpen(open => !open)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
        </button>
        {filtersOpen && <div className="review-filter-popover" role="dialog" aria-label="Transaction filters">
          <label>Month<select aria-label="Transaction month" value={month} onChange={event => setMonth(event.target.value)}>
            {monthOptions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select></label>
          <fieldset><legend>Status</legend><div className="review-filter-options">
            {FILTERS.map(item => <button type="button" key={item.key} className={filter === item.key ? 'active' : ''} onClick={() => setFilter(item.key)}>{item.label}</button>)}
          </div></fieldset>
          <button type="button" className="review-filter-done" onClick={() => setFiltersOpen(false)}>Done</button>
        </div>}
      </div>
    </div>
    {loading && <p className="bank-caption" role="status">Loading transactions…</p>}
    {!loading && !error && transactions.length === 0 && <section className="review-empty"><strong>{filter === 'unreviewed' ? 'Everything is categorized' : 'No matching transactions'}</strong><p>{filter === 'unreviewed' ? 'Only transactions the app could not categorize automatically appear here.' : 'Try another filter or search.'}</p></section>}
    {error && <p className="form-notice" role="alert">{error}</p>}
    <div className="review-list">
      {transactions.map(transaction => <button type="button" className={transaction.linkedExpense ? 'review-card linked-group-expense' : 'review-card'} key={transaction.id} aria-disabled={transaction.source === 'group_payment'} onClick={() => { if (transaction.source !== 'group_payment') setSelected(transaction); }}>
        <span className="review-card-main"><strong>{transaction.merchant}</strong><small>{transaction.institution} · {transaction.accountName} · {new Date(`${transaction.date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</small>
          {transaction.linkedExpense && <small className="review-linked-context">Linked to {transaction.linkedExpense.title} · {transaction.linkedExpense.groupName}</small>}
          <span className="review-badges">{transaction.pending && <em>Pending</em>}{transaction.linkedExpense && <em className="linked">Group expense</em>}{transaction.groupPayment && <em>{transaction.groupPayment.method} · {transaction.groupPayment.groupName}</em>}{transaction.excluded ? <em>Excluded</em> : transaction.splits.length ? <em>{transaction.splits.length} category split</em> : <em>{labelFor(transaction.category)}</em>}{transaction.needsReview && <em>Needs category</em>}</span>
          {transaction.note && <small className="review-note">{transaction.note}</small>}</span>
        {transaction.linkedExpense ? <span className="review-linked-amounts">
          <span className="review-budget-amount"><strong>{formatCents(transaction.linkedExpense.personalBudgetCents ?? 0)}</strong><small>Personal budget</small></span>
          <span className="review-original-amount"><strong>{formatCents(transaction.amountCents)}</strong><small>Original charge</small></span>
        </span> : <span className={transaction.amountCents < 0 ? 'review-amount income' : 'review-amount'}>{formatCents(transaction.amountCents)}</span>}
      </button>)}
    </div>
    {selected && <ReviewEditor transaction={selected} onCancel={() => setSelected(null)} onSaved={saved} />}
  </main>;
}
