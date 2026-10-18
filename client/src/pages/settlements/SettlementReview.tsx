import { useCallback, useRef, useState } from 'react';
import { settlementsApi } from '../../api/settlements.api';
import { createRequestId } from '../../utils/requestId';
import { useLiveData } from '../dashboard/useLiveData';
import { formatCents } from '../expenses/split';
import './settlements.css';
export default function SettlementReview({ groupId, groupName, onBack, onDone }: { groupId: string; groupName: string; onBack: () => void; onDone: () => void }) {
  const load = useCallback(() => settlementsApi.preview(groupId), [groupId]);
  const { data, error: loadError, refresh } = useLiveData(load, true);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const requestId = useRef(createRequestId());
  return <main className="settlement-review"><header><button type="button" onClick={onBack} disabled={busy} aria-label="Back to group">‹</button><h1>Split current expenses</h1><p>{groupName}</p></header>
    {!data && !loadError && <p role="status">Loading current transactions…</p>}
    {(loadError || error) && <p role="alert">{error || loadError}</p>}
    {loadError && <button type="button" onClick={() => void refresh()}>Reload transactions</button>}
    {data && (data.expenseIds.length ? <><h2>{formatCents(data.totalCents)} in outstanding repayments</h2>
      <p>Only transactions that have not already been included in a period split appear here. Paid transactions stay in history. Existing item assignments and shares are preserved, and confirmed repayments are subtracted.</p>
      <ul>{data.expenses.map(expense => <li key={expense.id}><strong>{expense.title}</strong> · {formatCents(expense.outstandingCents)} outstanding</li>)}</ul>
      <p>Any member can start this split. Everyone will see payment notifications on Groups and Home. Starting a split does not send money or mark it paid.</p>
      <button type="button" className="group-primary" disabled={busy} onClick={async () => {
        if (busy) return;
        setBusy(true); setError('');
        try { await settlementsApi.initialize(groupId, { clientRequestId: requestId.current, expenseIds: data.expenseIds, totalCents: data.totalCents }); window.dispatchEvent(new Event('cse416:settlements')); onDone(); }
        catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not initialize split.'); }
        finally { setBusy(false); }
      }}>{busy ? 'Starting split…' : 'Initialize split'}</button>
      {error && <button type="button" disabled={busy} onClick={() => { requestId.current = createRequestId(); setError(''); void refresh(); }}>Review updated transactions</button>}
    </> : <><p>All current transactions have already been split or resolved. Use Group payments to finish existing splits.</p><button type="button" className="group-primary" onClick={onDone}>View group payments</button></>)}
  </main>;
}
