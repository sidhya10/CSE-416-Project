import { useCallback, useRef, useState } from 'react';
import { settlementsApi } from '../../api/settlements.api';
import { createRequestId } from '../../utils/requestId';
import { useLiveData } from '../dashboard/useLiveData';
import { formatCents } from '../expenses/split';
import BackArrow from '../../components/common/BackArrow';
import './settlements.css';
export default function SettlementReview({ groupId, groupName, onBack, onDone }: { groupId: string; groupName: string; onBack: () => void; onDone: () => void }) {
  const load = useCallback(() => settlementsApi.preview(groupId), [groupId]);
  const { data, error: loadError, refresh } = useLiveData(load, true);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const requestId = useRef(createRequestId());
  return <main className="settlement-review"><header className="settlement-review-header"><button type="button" onClick={onBack} disabled={busy} aria-label="Back to group"><BackArrow /></button><div><h1>Split current expenses</h1><p>{groupName}</p></div></header>
    <div className="settlement-review-body">
    {!data && !loadError && <p role="status">Loading current transactions…</p>}
    {(loadError || error) && <p role="alert">{error || loadError}</p>}
    {loadError && <button type="button" onClick={() => void refresh()}>Reload transactions</button>}
    {data && (data.expenseIds.length ? <>
      <section className="settlement-review-total" aria-label="Outstanding repayments">
        <span>Outstanding repayments</span>
        <strong>{formatCents(data.totalCents)}</strong>
        <small>{data.expenses.length} {data.expenses.length === 1 ? 'expense' : 'expenses'} to settle · Confirmed payments deducted</small>
      </section>
      <section className="settlement-review-expenses" aria-labelledby="included-expenses">
        <div className="settlement-review-section-title"><h2 id="included-expenses">Included expenses</h2><span>{data.expenses.length}</span></div>
        <ul>{data.expenses.map(expense => <li key={expense.id}>
          <span className="settlement-review-icon" aria-hidden="true">↗</span>
          <div><strong>{expense.title}</strong><small>Still owed</small></div>
          <b>{formatCents(expense.outstandingCents)}</b>
        </li>)}</ul>
      </section>
      <div className="settlement-review-note"><span aria-hidden="true">✓</span><p>Everyone keeps their original shares.</p></div>
      <details className="settlement-review-help"><summary>How does this work?</summary><p>Any member can start a split. Only unpaid expenses that haven’t been included in a previous split appear here. Paid expenses stay in history.</p><p>Item assignments stay the same. Members can track payments from Home or Groups.</p></details>
      <div className="settlement-review-actions">
      <button type="button" className="group-primary" disabled={busy} onClick={async () => {
        if (busy) return;
        setBusy(true); setError('');
        try { await settlementsApi.initialize(groupId, { clientRequestId: requestId.current, expenseIds: data.expenseIds, totalCents: data.totalCents }); window.dispatchEvent(new Event('cse416:settlements')); onDone(); }
        catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not initialize split.'); }
        finally { setBusy(false); }
      }}>{busy ? 'Starting split…' : 'Start split'}</button>
      <p className="settlement-review-disclaimer">No money is sent or marked paid when you start a split.</p>
      </div>
      {error && <button type="button" disabled={busy} onClick={() => { requestId.current = createRequestId(); setError(''); void refresh(); }}>Review updated transactions</button>}
    </> : <div className="settlement-review-empty"><h2>You’re all caught up</h2><p>All current transactions have already been split or resolved. Use Group payments to finish existing splits.</p><button type="button" className="group-primary" onClick={onDone}>View group payments</button></div>)}
    </div>
  </main>;
}
