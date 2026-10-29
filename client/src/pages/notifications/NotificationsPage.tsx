import { useState } from 'react';
import BackArrow from '../../components/common/BackArrow';
import { settlementsApi } from '../../api/settlements.api';
import { useLiveData } from '../dashboard/useLiveData';
import './notifications.css';

export default function NotificationsPage({ active, onBack, onOpenGroup }: { active: boolean; onBack: () => void; onOpenGroup?: (groupId: string, expenseId?: string) => void }) {
  const { data, error, refresh } = useLiveData(settlementsApi.notifications, active);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');
  async function markRead(id: string) {
    if (saving) return;
    setSaving(id); setSaveError('');
    try {
      await settlementsApi.dismiss(id);
      await refresh();
      window.dispatchEvent(new Event('cse416:settlements'));
    } catch { setSaveError('Could not mark this notification as read. Please try again.'); }
    finally { setSaving(null); }
  }
  return <main className="notifications-page">
    <header><button className="notifications-back" type="button" aria-label="Back to Home" onClick={onBack}><BackArrow /></button><div><h1>Notifications</h1><p>Reminders and payment updates</p></div></header>
    {(error || saveError) && <div className="notifications-error" role="alert"><p>{saveError || error}</p>{error && <button type="button" onClick={() => void refresh()}>Try again</button>}</div>}
    {!data && !error && <p role="status">Loading notifications…</p>}
    {data && !data.notices.length && <section className="notifications-empty"><span aria-hidden="true">✓</span><h2>You’re all caught up</h2><p>Your reminders and payment confirmations will appear here.</p></section>}
    {!!data?.notices.length && <><p className="notifications-count">{data.notices.filter(n => !n.readAt).length} unread</p><ul className="notifications-list">{data.notices.map(n => <li key={n.id} className={`notification-item ${n.readAt ? 'is-read' : 'is-unread'}`}>
      <div className={`notification-symbol ${n.kind === 'CONFIRMED' ? 'confirmed' : ''}`} aria-hidden="true">{n.kind === 'CONFIRMED' ? '✓' : n.kind === 'ISSUE' ? '!' : '↗'}</div>
      <div className="notification-content"><div className="notification-heading"><strong>{n.kind === 'BUDGET_LINK' ? 'Set up your expense budget' : n.kind === 'PAYMENT_SENT' ? 'Confirm payment received' : n.kind === 'SPLIT_CREATED' ? 'New split ready' : n.kind === 'CONFIRMED' ? 'Payment confirmed' : n.kind === 'ISSUE' ? 'Payment needs review' : 'Payment reminder'}</strong>{!n.readAt && <span className="notification-unread">Unread</span>}</div>
      {onOpenGroup ? <button className="notification-open" type="button" onClick={() => { if (!n.readAt) void markRead(n.id); if (n.expenseId) onOpenGroup(n.groupId, n.expenseId); else onOpenGroup(n.groupId); }}><span>{n.message}</span><strong>{n.kind === 'BUDGET_LINK' ? 'View expense budget →' : 'View group →'}</strong></button> : <p>{n.message}</p>}<time dateTime={n.createdAt}>{new Date(n.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>
      {!n.readAt && <button type="button" disabled={saving !== null} onClick={() => void markRead(n.id)}>{saving === n.id ? 'Saving…' : 'Mark as read'}</button>}</div>
    </li>)}</ul></>}
  </main>;
}
