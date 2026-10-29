import { useEffect, useState } from 'react';
import { apiRequest } from '../../api/client';
import { formatCents } from './split';
type Link = { reviewed?: boolean; expenseTotalCents?: number; ownShareCents?: number; category: string; linked: boolean; transactionId: string | null; canLink: boolean; candidates: { id: string; name: string; merchant: string | null; date: string; amountCents: number; pending: boolean; category?: string }[] };
export default function ExpenseBudgetLink({ expenseId, onSaved }: { expenseId: string; onSaved?: () => void }) {
  const [data, setData] = useState<Link>();
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editingLink, setEditingLink] = useState(false);
  const [search, setSearch] = useState('');
  const [choosingTransaction, setChoosingTransaction] = useState(false);
  useEffect(() => { let active = true; void apiRequest<Link>(`/expenses/${expenseId}/budget-link`).then(value => { if (active) setData(value); }).catch(() => { if (active) setError('Could not load budget linking. Reopen this expense to retry.'); }); return () => { active = false; }; }, [expenseId]);
  const matches = (data?.candidates ?? []).filter(t => `${t.merchant ?? ''} ${t.name} ${t.date.slice(0, 10)} ${formatCents(t.amountCents)} ${(t.amountCents / 100).toFixed(2)}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => Number(b.amountCents === data?.expenseTotalCents) - Number(a.amountCents === data?.expenseTotalCents));
  const viewBudget = () => window.dispatchEvent(new CustomEvent('cse416:open-budget-expense', { detail: { category: data?.category, expenseId } }));
  const categoryControl = data && <>
    <label>Your budget category<select value={data.category} disabled={busy} onChange={async event => {
      const category = event.target.value; setBusy(true); setError(''); setSaved(false);
      try { await apiRequest(`/expenses/${expenseId}/budget-category`, { method: 'PUT', body: JSON.stringify({ category }) }); setData({ ...data, category }); window.dispatchEvent(new Event('cse416:settlements')); }
      catch { setError('Could not save your category. Please try again.'); } finally { setBusy(false); }
    }}>{['dining', 'groceries', 'transit', 'shopping', 'other'].map(category => <option key={category} value={category}>{category[0]!.toUpperCase() + category.slice(1)}</option>)}</select></label>
    <p>This changes only your budget. Defaults to Other.</p>
    {error && <p role="alert">{error}</p>}
  </>;
  if (data && !data.canLink) return <section className="expense-budget-link">
    <h2>Your personal budget</h2>
    <p>Your share{data.ownShareCents !== undefined ? ` of ${formatCents(data.ownShareCents)}` : ''} counts in your budget.</p>
    {categoryControl}
    <button type="button" className="expense-outline" disabled={busy} onClick={viewBudget}>View in budget</button>
  </section>;
  if (data?.reviewed && !data.transactionId && !editingLink) {
    return <section className="expense-budget-link bank-link-complete">
      <h2><span aria-hidden="true">✓ </span>Budget setup complete</h2>
      <div className="bank-link-summary"><strong>No bank transaction linked</strong></div>
      <p>{data.ownShareCents !== undefined ? `Your budget counts your ${formatCents(data.ownShareCents)} share.` : 'Your budget counts your share.'} You can link a bank charge later if one appears.</p>
      {categoryControl}
      <button type="button" className="expense-outline" disabled={busy} onClick={viewBudget}>View in budget</button>
      <button type="button" className="expense-outline" onClick={() => { setEditingLink(true); setChoosingTransaction(true); setSaved(false); }}>Link a transaction</button>
      {saved && <p role="status">Budget choice saved.</p>}
    </section>;
  }
  if (data?.linked && data.transactionId && !editingLink) {
    const linkedTransaction = data.candidates.find(t => t.id === data.transactionId);
    return <section className="expense-budget-link bank-link-complete">
      <h2><span aria-hidden="true">✓ </span>Bank transaction linked</h2>
      <div className="bank-link-summary"><strong>{linkedTransaction?.merchant ?? linkedTransaction?.name ?? 'Saved bank transaction'}</strong>
        {linkedTransaction && <span>{linkedTransaction.date.slice(0, 10)} · {formatCents(linkedTransaction.amountCents)}</span>}
      </div>
      <p>{data.ownShareCents !== undefined ? `Your budget counts your ${formatCents(data.ownShareCents)} share.` : 'Your budget counts your share.'} The linked bank charge is excluded to avoid double counting.</p>
      {categoryControl}
      <button type="button" className="expense-outline" disabled={busy} onClick={viewBudget}>View in budget</button>
      <button type="button" className="expense-outline" onClick={() => { setEditingLink(true); setChoosingTransaction(true); setSaved(false); }}>Change link</button>
      {saved && <p role="status">Bank link saved.</p>}
    </section>;
  }
  return <section className="expense-budget-link"><h2>Personal budget</h2><p>Each person’s share counts once, on the expense date. Repayments only settle the debt.</p>{error && <p role="alert">{error}</p>}{data && <>
    {data.canLink ? <>{data.ownShareCents !== undefined && <p><strong>Your budget counts {formatCents(data.ownShareCents)}</strong> for this expense.</p>}
    {categoryControl}
    <div className="bank-link-choices" role="group" aria-label="Bank transaction options">
      <button type="button" className="expense-outline" aria-pressed={!choosingTransaction && !data.transactionId} disabled={busy} onClick={() => { setChoosingTransaction(false); setData({ ...data, transactionId: null }); setSaved(false); }}>No transaction</button>
      <button type="button" className="expense-outline" aria-pressed={choosingTransaction || !!data.transactionId} disabled={busy} onClick={() => setChoosingTransaction(true)}>Link transaction</button>
    </div>
    {!choosingTransaction && data.transactionId && <p>Linked: {data.candidates.find(t => t.id === data.transactionId)?.merchant ?? data.candidates.find(t => t.id === data.transactionId)?.name ?? 'Bank transaction'}. Select Link transaction to change it.</p>}
    {choosingTransaction && <div className="bank-transaction-picker">
      <label>Search transactions<input type="search" placeholder="Merchant, date, or amount" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <div className="bank-transaction-results" role="group" aria-label="Matching transactions">
        {matches.map(t => <button type="button" key={t.id} className="bank-transaction-result" aria-pressed={data.transactionId === t.id} disabled={busy} onClick={() => { setSaved(false); setData({ ...data, transactionId: t.id }); }}>
          <span><strong>{t.merchant ?? t.name}</strong><small>{t.date.slice(0, 10)}{t.amountCents === data.expenseTotalCents ? ' · Matches receipt total' : ''}</small></span>
          <strong>{formatCents(t.amountCents)}{data.transactionId === t.id ? ' ✓' : ''}</strong>
        </button>)}
      </div>
      {matches.length === 0 && data.candidates.length > 0 && <p>No matching transactions. Try another merchant, date, or amount.</p>}
    </div>}
    <p>{data.transactionId ? 'The selected bank charge will be excluded from budget totals. Your expense share is counted instead.' : choosingTransaction ? 'Choose the charge for this receipt. Exact amount matches appear first.' : 'No bank charge to link? Your share still counts. You can link a transaction later if it appears in your bank account.'}</p>
    {choosingTransaction && data.candidates.length === 0 && <p>No available bank charges found. Connect or sync your bank in Profile, then reopen this expense. Pending charges and charges linked to another expense are not listed.</p>}
    {data.transactionId && data.expenseTotalCents !== undefined && data.candidates.find(t => t.id === data.transactionId)?.amountCents !== data.expenseTotalCents && <p role="note">This charge differs from the receipt total of {formatCents(data.expenseTotalCents)}. Only link it if it represents this entire expense: the full bank charge will be replaced by your receipt share in your budget.</p>}
    <button type="button" className="expense-outline" disabled={busy || (choosingTransaction && !data.transactionId)} onClick={async () => { setBusy(true); setError(''); setSaved(false); try { await apiRequest(`/expenses/${expenseId}/budget-link`, { method: 'PUT', body: JSON.stringify({ transactionId: data.transactionId }) }); setData({ ...data, reviewed: true, linked: !!data.transactionId }); setEditingLink(false); setChoosingTransaction(false); setSaved(true); onSaved?.(); window.dispatchEvent(new Event('cse416:settlements')); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save'); } finally { setBusy(false); } }}>{busy ? 'Saving…' : 'Save'}</button>{saved && <p role="status">Bank link saved.</p>}</> : <p>Your share counts under {data.category}. The payer manages the category and bank link.</p>}
  </>}</section>;
}
