import { useEffect, useRef, useState } from 'react';
import { settlementsApi, paymentMethods, type SettlementBatch, type SettlementPair } from '../../api/settlements.api';
import MobileDialog from '../../components/common/MobileDialog';
import { createRequestId } from '../../utils/requestId';
import { formatCents } from '../expenses/split';
import { useLiveData } from '../dashboard/useLiveData';
import './settlements.css';

export default function SettlementInbox({ active = true, onChanged }: { active?: boolean; onChanged?: () => void }) {
  const { data, error: loadError, refresh } = useLiveData(settlementsApi.inbox, active);
  const [selection, setSelection] = useState<{ kind: 'send' | 'collect'; batchId: string; recipientId: string } | null>(null);
  const [method, setMethod] = useState<string>(paymentMethods[0]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const requestId = useRef(createRequestId());
  const reportedAmount = useRef(0);
  const changed = useRef(onChanged); changed.current = onChanged;
  useEffect(() => {
    if (!active) return;
    const listener = () => { void refresh(); };
    window.addEventListener('cse416:settlements', listener);
    return () => window.removeEventListener('cse416:settlements', listener);
  }, [active, refresh]);
  const run = async (work: () => Promise<unknown>, success: string) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await work(); await refresh(); changed.current?.(); setMessage(success); return true; }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save. Please try again.'); return false; }
    finally { setBusy(false); }
  };
  const open = (kind: 'send' | 'collect', batchId: string, recipientId: string, amount = 0) => {
    requestId.current = createRequestId(); reportedAmount.current = amount; setMethod(paymentMethods[0]); setError(''); setMessage(''); setSelection({ kind, batchId, recipientId });
  };
  const batch = data?.batches.find(b => b.id === selection?.batchId);
  const pair = batch?.pairs.find(p => p.senderId === data?.userId && p.recipientId === selection?.recipientId);
  const collection = batch?.pairs.filter(p => p.recipientId === data?.userId) ?? [];
  const show = data?.batches.some(b => !b.completed && b.pairs.some(p => (p.senderId === data.userId || p.recipientId === data.userId) && p.confirmedCents < p.amountCents)) || !!data?.notices.length;
  if (!active) return null;
  if (!data) return loadError ? <p className="settlement-status">Could not load group payments. <button type="button" onClick={() => void refresh()}>Reload payments</button></p> : null;
  return <section className="settlement-inbox" aria-label="Group payment notifications">
    {show && <h2>Group payments</h2>}
    {data.notices.map(notice => <div className="settlement-notice" key={notice.id}><p>{notice.message}</p><button type="button" aria-label={`Dismiss ${notice.message}`} disabled={busy} onClick={() => void run(() => settlementsApi.dismiss(notice.id), '')}>Dismiss</button></div>)}
    {data.batches.filter(b => !b.completed).map(item => {
      const outgoing = item.pairs.filter(p => p.senderId === data.userId && p.confirmedCents < p.amountCents);
      const incoming = item.pairs.filter(p => p.recipientId === data.userId);
      return <div key={item.id}>
        {outgoing.map(p => <button className={`settlement-card ${p.unreportedCents ? 'settlement-attention' : 'settlement-waiting'}`} type="button" key={p.recipientId} onClick={() => open('send', item.id, p.recipientId, p.unreportedCents)}>
          <strong>{p.unreportedCents ? `Send ${p.recipientName} ${formatCents(p.unreportedCents)}` : `Waiting for ${p.recipientName} to confirm`}</strong>
          <small>{item.groupName} · {item.expenses.length} {item.expenses.length === 1 ? 'transaction' : 'transactions'}{p.pendingCents ? ` · ${formatCents(p.pendingCents)} reported sent` : ''}</small>
        </button>)}
        {incoming.some(p => p.confirmedCents < p.amountCents) && <CollectionCard batch={item} pairs={incoming} onClick={() => open('collect', item.id, data.userId)} />}
      </div>;
    })}
    {!selection && error && <p role="alert">{error}</p>}
    {!selection && message && <p className="settlement-status" role="status">{message}</p>}
    {selection && <MobileDialog title={selection.kind === 'send' ? 'Confirm money sent' : 'Collection progress'} busy={busy} onClose={() => setSelection(null)}>
      {!batch && <p>This split is no longer available.</p>}
      {batch && <><p className="settlement-caption">{batch.groupName} · {batch.expenses.map(e => e.title).join(', ')}</p>
        {selection.kind === 'send' && pair && <>
          <p>{pair.confirmedCents === pair.amountCents ? `${pair.recipientName} confirmed receiving your payment. This part of the split is resolved.` : pair.unreportedCents ? `Send ${formatCents(pair.unreportedCents)} to ${pair.recipientName}.` : `You have reported the payment. ${pair.recipientName} will confirm when it arrives.`}</p>
          {pair.pendingPayments.map(payment => <p key={payment.id}>{formatCents(payment.cents)} via {payment.method ?? 'method not recorded'} · awaiting confirmation</p>)}
          {pair.unreportedCents > 0 && <form onSubmit={event => {
            event.preventDefault();
            if (reportedAmount.current !== pair.unreportedCents) { setError('The amount changed. Close and reopen this card before confirming.'); return; }
            void run(() => settlementsApi.report(batch.id, { recipientId: pair.recipientId, amountCents: reportedAmount.current, method, clientRequestId: requestId.current }), 'Payment reported. The recipient will confirm when it arrives.').then(ok => { if (ok) setSelection(null); });
          }}><label>How did you send it?<select value={method} disabled={busy} onChange={event => setMethod(event.target.value)}>{paymentMethods.map(m => <option key={m}>{m}</option>)}</select></label>
            <p className="settlement-caption">Only confirm after sending the money using your chosen method. This app records payments; it does not transfer money.</p>
            <button className="settlement-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : `I sent ${formatCents(pair.unreportedCents)}`}</button></form>}
        </>}
        {selection.kind === 'collect' && <><p>Reported sent includes payments you have received and payments waiting for your confirmation.</p>
          {collection.map(p => <div className={`settlement-person ${p.confirmedCents === p.amountCents ? 'settlement-person-confirmed' : p.pendingCents ? 'settlement-person-pending' : 'settlement-person-unpaid'}`} key={p.senderId}><strong>{p.senderName} · {formatCents(p.amountCents)}</strong>
            <span className="settlement-person-status">{p.confirmedCents === p.amountCents ? 'Received and confirmed' : p.pendingCents ? `${formatCents(p.pendingCents)} reported sent · confirm receipt` : 'Not sent yet'}</span>
            {!!p.confirmedCents && p.confirmedCents < p.amountCents && <small>{formatCents(p.confirmedCents)} already confirmed</small>}
            {p.pendingPayments.map(payment => <small key={payment.id}>{formatCents(payment.cents)} · {payment.method ?? 'method not recorded'}</small>)}
            {!!p.pendingPayments.length && <div className="settlement-person-actions"><button className="settlement-confirm-action" type="button" disabled={busy} onClick={() => void run(() => settlementsApi.confirm(batch.id, { senderId: p.senderId, paymentIds: p.pendingPayments.map(pay => pay.id), status: 'CONFIRMED' }), `Receipt from ${p.senderName} confirmed.`)}>Confirm received from {p.senderName}</button>
              <button type="button" disabled={busy} onClick={() => void run(() => settlementsApi.confirm(batch.id, { senderId: p.senderId, paymentIds: p.pendingPayments.map(pay => pay.id), status: 'ISSUE' }), 'Payment flagged for review.')}>Not received</button></div>}
            {p.unreportedCents > 0 && <button className="settlement-remind-action" type="button" disabled={busy} onClick={() => void run(() => settlementsApi.remind(batch.id, p.senderId), `In-app reminder sent to ${p.senderName}.`)}>Remind {p.senderName}</button>}
          </div>)}
        </>}
      </>}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <button className="settlement-close" type="button" disabled={busy} onClick={() => setSelection(null)}>Close</button>
    </MobileDialog>}
  </section>;
}
function CollectionCard({ batch, pairs, onClick }: { batch: SettlementBatch; pairs: SettlementPair[]; onClick: () => void }) {
  const total = pairs.reduce((sum, p) => sum + p.amountCents, 0), sent = pairs.reduce((sum, p) => sum + p.confirmedCents + p.pendingCents, 0);
  const confirmed = pairs.filter(p => p.confirmedCents === p.amountCents).length;
  const reported = pairs.filter(p => p.confirmedCents + p.pendingCents === p.amountCents).length;
  return <button type="button" className="settlement-card collection settlement-attention" onClick={onClick}><strong>{batch.groupName} · Collect {formatCents(total)}</strong>
    <small>{reported} of {pairs.length} people reported sent · {confirmed} confirmed received</small>
    <span role="progressbar" aria-label={`Collection progress for ${batch.groupName}`} aria-valuemin={0} aria-valuemax={total} aria-valuenow={sent}><i style={{ width: `${total ? sent / total * 100 : 0}%` }} /></span>
    <small>{formatCents(sent)} of {formatCents(total)} reported sent · Tap to review</small></button>;
}
