import { useEffect, useRef, useState } from 'react';
import { settlementsApi, paymentMethods } from '../../api/settlements.api';
import MobileDialog from '../../components/common/MobileDialog';
import { createRequestId } from '../../utils/requestId';
import { formatCents } from '../expenses/split';
import { useLiveData } from '../dashboard/useLiveData';
import { confirmAllocations, groupPayments, reportAllocations, type GroupPaymentPair, type GroupPayments } from './group-payments';
import './settlements.css';

export default function SettlementInbox({ active = true, onChanged, groupId }: { active?: boolean; onChanged?: () => void; groupId?: string }) {
  const { data, error: loadError, refresh } = useLiveData(settlementsApi.inbox, active);
  const [selection, setSelection] = useState<{ kind: 'send' | 'collect'; groupId: string; batchIds: string[] } | null>(null);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const changed = useRef(onChanged); changed.current = onChanged;
  useEffect(() => {
    if (!active) return;
    const listener = () => { void refresh(); };
    window.addEventListener('cse416:settlements', listener);
    return () => window.removeEventListener('cse416:settlements', listener);
  }, [active, refresh]);
  const run = async (work: () => Promise<unknown>, success: string) => {
    if (busy) return false;
    setBusy(true); setError('');
    try { await work(); await refresh(); window.dispatchEvent(new Event('cse416:settlements')); changed.current?.(); setMessage(success); return true; }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save. Please try again.'); return false; }
    finally { setBusy(false); }
  };
  const open = (kind: 'send' | 'collect', groupId: string) => { setError(''); setMessage(''); setSelection({ kind, groupId, batchIds: data?.batches.filter(b => b.groupId === groupId && !b.completed).map(b => b.id) ?? [] }); };
  if (!active) return null;
  if (!data) return loadError ? <p className="settlement-status">Could not load group payments. <button type="button" onClick={() => void refresh()}>Reload payments</button></p> : null;
  const groups = groupPayments(data.batches).filter(group => !groupId || group.id === groupId);
  const selected = selection ? groupPayments(data.batches, selection.batchIds).find(g => g.id === selection.groupId) : undefined;
  const outgoing = selected?.pairs.filter(p => p.senderId === data.userId && p.confirmedCents < p.amountCents) ?? [];
  const collection = selected?.pairs.filter(p => p.recipientId === data.userId) ?? [];
  const visible = groups.filter(g => g.pairs.some(p => (p.senderId === data.userId || p.recipientId === data.userId) && p.confirmedCents < p.amountCents));
  return <section className="settlement-inbox" aria-label={groupId ? 'Your payments' : 'Group payment notifications'}>
    {!!visible.length && <h2>{groupId ? 'Your payments' : 'Group payments'}</h2>}
    {visible.map(group => {
      const owes = group.pairs.filter(p => p.senderId === data.userId && p.confirmedCents < p.amountCents);
      const incoming = group.pairs.filter(p => p.recipientId === data.userId);
      const due = owes.filter(p => p.unreportedCents > 0);
      const unsent = owes.reduce((sum, p) => sum + p.unreportedCents, 0), pending = owes.reduce((sum, p) => sum + p.pendingCents, 0);
      return <div key={group.id}>
        {!!owes.length && <button className={`settlement-card ${unsent ? 'settlement-attention' : 'settlement-waiting'}`} type="button" onClick={() => open('send', group.id)}>
          <strong>{unsent ? due.length === 1 ? `Send ${due[0]!.recipientName} ${formatCents(unsent)}` : `Send ${formatCents(unsent)} to ${due.length} people` : owes.length === 1 ? `Waiting for ${owes[0]!.recipientName} to confirm` : 'Waiting for payment confirmations'}</strong>
          <small>{group.groupName} · {group.expenses.length} {group.expenses.length === 1 ? 'transaction' : 'transactions'}{pending ? ` · ${formatCents(pending)} reported sent` : ''}</small>
        </button>}
        {incoming.some(p => p.confirmedCents < p.amountCents) && <CollectionCard group={group} pairs={incoming} onClick={() => open('collect', group.id)} />}
      </div>;
    })}
    {!selection && error && <p role="alert">{error}</p>}
    {!selection && message && <p className="settlement-status" role="status">{message}</p>}
    {selection && <MobileDialog title={selection.kind === 'send' ? 'Confirm money sent' : 'Collection progress'} busy={busy} onClose={() => setSelection(null)}>
      {!selected && <p>All payments in this group are resolved.</p>}
      {selected && <><p className="settlement-caption">{selected.groupName} · {selected.expenses.map(e => e.title).join(', ')}</p>
        <p className="settlement-caption">Unresolved payments from all splits in this group are combined here. New splits add to these totals.</p>
        {selection.kind === 'send' && outgoing.map(pair => <SendPayment key={pair.recipientId} groupId={selected.id} pair={pair} busy={busy} run={run} onDone={() => { if (outgoing.length === 1) setSelection(null); }} />)}
        {selection.kind === 'collect' && <><p>Reported sent includes payments you have received and payments waiting for your confirmation.</p>
          {collection.map(pair => <div className="settlement-person" key={pair.senderId}><strong>{pair.senderName} · {formatCents(pair.amountCents - pair.confirmedCents)} outstanding</strong>
            <span>{pair.confirmedCents === pair.amountCents ? 'Received and confirmed' : pair.pendingCents ? `${formatCents(pair.pendingCents)} reported sent · confirm receipt` : 'Not sent yet'}</span>
            {!!pair.confirmedCents && pair.confirmedCents < pair.amountCents && <small>{formatCents(pair.confirmedCents)} already confirmed</small>}
            {pair.pendingPayments.map(payment => <small key={payment.id}>{formatCents(payment.cents)} · {payment.method ?? 'method not recorded'}</small>)}
            {!!pair.pendingPayments.length && <div className="settlement-person-actions"><button type="button" disabled={busy} onClick={() => void run(() => settlementsApi.confirmGroup(selected.id, { senderId: pair.senderId, allocations: confirmAllocations(pair), status: 'CONFIRMED' }), `Receipt from ${pair.senderName} confirmed.`)}>Confirm received from {pair.senderName}</button>
              <button type="button" disabled={busy} onClick={() => void run(() => settlementsApi.confirmGroup(selected.id, { senderId: pair.senderId, allocations: confirmAllocations(pair), status: 'ISSUE' }), 'Payment flagged for review.')}>Not received</button></div>}
            {pair.unreportedCents > 0 && <button type="button" disabled={busy} onClick={() => void run(() => settlementsApi.remindGroup(selected.id, pair.senderId), `In-app reminder sent to ${pair.senderName}.`)}>Remind {pair.senderName}</button>}
          </div>)}
        </>}
      </>}
      {error && <p role="alert">{error}</p>}{message && <p className="settlement-status" role="status">{message}</p>}
      <button className="settlement-close" type="button" disabled={busy} onClick={() => setSelection(null)}>Close</button>
    </MobileDialog>}
  </section>;
}
function SendPayment({ groupId, pair, busy, run, onDone }: { groupId: string; pair: GroupPaymentPair; busy: boolean; run: (work: () => Promise<unknown>, success: string) => Promise<boolean>; onDone: () => void }) {
  const [method, setMethod] = useState<string>(paymentMethods[0]);
  const snapshot = useRef({ requestId: createRequestId(), allocations: reportAllocations(pair) });
  const current = reportAllocations(pair), stale = JSON.stringify(current) !== JSON.stringify(snapshot.current.allocations);
  return <div className="settlement-person"><strong>{pair.recipientName}</strong>
    <p>{pair.unreportedCents ? `Send ${formatCents(pair.unreportedCents)} to ${pair.recipientName}.` : `You have reported the payment. ${pair.recipientName} will confirm when it arrives.`}</p>
    {pair.pendingPayments.map(payment => <small key={payment.id}>{formatCents(payment.cents)} via {payment.method ?? 'method not recorded'} · awaiting confirmation</small>)}
    {pair.unreportedCents > 0 && <form onSubmit={event => { event.preventDefault(); if (stale) return;
      void run(() => settlementsApi.reportGroup(groupId, { recipientId: pair.recipientId, method, clientRequestId: snapshot.current.requestId, allocations: snapshot.current.allocations }), 'Payment reported. The recipient will confirm when it arrives.').then(ok => { if (ok) onDone(); });
    }}><label>How did you send it?<select value={method} disabled={busy} onChange={event => setMethod(event.target.value)}>{paymentMethods.map(m => <option key={m}>{m}</option>)}</select></label>
      <p className="settlement-caption">Only confirm after sending the money using your chosen method. This app records payments; it does not transfer money.</p>
      {stale && <p role="alert">The amount changed. Close and reopen this card to review the updated total.</p>}
      <button className="settlement-primary" type="submit" disabled={busy || stale}>{busy ? 'Saving…' : `I sent ${formatCents(pair.unreportedCents)}`}</button></form>}
  </div>;
}
function CollectionCard({ group, pairs, onClick }: { group: GroupPayments; pairs: GroupPaymentPair[]; onClick: () => void }) {
  const total = pairs.reduce((sum, p) => sum + p.amountCents, 0), sent = pairs.reduce((sum, p) => sum + p.confirmedCents + p.pendingCents, 0), received = pairs.reduce((sum, p) => sum + p.confirmedCents, 0);
  const confirmed = pairs.filter(p => p.confirmedCents === p.amountCents).length, reported = pairs.filter(p => p.confirmedCents + p.pendingCents === p.amountCents).length;
  return <button type="button" className="settlement-card collection settlement-attention" onClick={onClick}><strong>{group.groupName} · Collect {formatCents(total - received)}</strong>
    <small>{reported} of {pairs.length} people reported sent · {confirmed} confirmed received</small>
    <span role="progressbar" aria-label={`Collection progress for ${group.groupName}`} aria-valuemin={0} aria-valuemax={total} aria-valuenow={sent}><i style={{ width: `${total ? sent / total * 100 : 0}%` }} /></span>
    <small>{formatCents(sent)} of {formatCents(total)} reported sent · Tap to review</small></button>;
}
