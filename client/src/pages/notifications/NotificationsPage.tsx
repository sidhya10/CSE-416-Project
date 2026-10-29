import { useState } from 'react';
import BackArrow from '../../components/common/BackArrow';
import { settlementsApi } from '../../api/settlements.api';
import { useLiveData } from '../dashboard/useLiveData';
import './notifications.css';

export default function NotificationsPage({ active, onBack, onOpenGroup }: { active: boolean; onBack: () => void; onOpenGroup?: (groupId: string, expenseId?: string) => void }) {
  const { data, error, refresh } = useLiveData(settlementsApi.notifications, active);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');
  async function markRead(id: string, unread = false) {
    if (saving) return;
    setSaving(id); setSaveError('');
    try {
      if (unread) await settlementsApi.markUnread(id); else await settlementsApi.dismiss(id);
      await refresh();
      window.dispatchEvent(new Event('cse416:settlements'));
    } catch { setSaveError('Could not update this notification. Please try again.'); }
    finally { setSaving(null); }
  }
  async function remove(id?: string) {
    if (saving) return;
    setSaving(id ?? 'all'); setSaveError('');
    try {
      if (id) await settlementsApi.deleteNotification(id); else await settlementsApi.clearNotifications();
      await refresh(); window.dispatchEvent(new Event('cse416:settlements'));
    } catch { setSaveError('Could not delete notifications. Please try again.'); }
    finally { setSaving(null); }
  }
  return <main className="notifications-page">
    <header><button className="notifications-back" type="button" aria-label="Back to Home" onClick={onBack}><BackArrow /></button><div><h1>Notifications</h1><p>Reminders and payment updates</p></div></header>
    {(error || saveError) && <div className="notifications-error" role="alert"><p>{saveError || error}</p>{error && <button type="button" onClick={() => void refresh()}>Try again</button>}</div>}
    {!data && !error && <p role="status">Loading notifications…</p>}
    {data && !data.notices.length && <section className="notifications-empty"><span aria-hidden="true">✓</span><h2>You’re all caught up</h2><p>Your reminders and payment confirmations will appear here.</p></section>}
    {!!data?.notices.length && <><div className="notifications-toolbar"><p className="notifications-count">{data.notices.filter(n => !n.readAt).length} unread</p><button className="notifications-clear" type="button" disabled={saving !== null} onClick={() => void remove()}>{saving === 'all' ? 'Clearing…' : 'Clear all'}</button></div><ul className="notifications-list">{data.notices.map(n => <li key={n.id} className={`notification-item ${n.readAt ? 'is-read' : 'is-unread'}`}>
      <div className={`notification-symbol ${n.kind === 'CONFIRMED' ? 'confirmed' : ''}`} aria-hidden="true">{n.kind === 'CONFIRMED' ? '✓' : n.kind === 'ISSUE' ? '!' : '↗'}</div>
      <div className="notification-content"><div className="notification-heading"><strong>{n.kind === 'BUDGET_LINK' ? 'Set up your expense budget' : n.kind === 'PAYMENT_SENT' ? 'Confirm payment received' : n.kind === 'SPLIT_CREATED' ? 'New split ready' : n.kind === 'CONFIRMED' ? 'Payment confirmed' : n.kind === 'ISSUE' ? 'Payment needs review' : 'Payment reminder'}</strong>{!n.readAt && <span className="notification-unread">Unread</span>}</div>
      {onOpenGroup ? <button className="notification-open" type="button" onClick={() => { if (!n.readAt) void markRead(n.id); if (n.expenseId) onOpenGroup(n.groupId, n.expenseId); else onOpenGroup(n.groupId); }}><span>{n.message}</span><strong>{n.kind === 'BUDGET_LINK' ? 'View expense budget →' : 'View group →'}</strong></button> : <p>{n.message}</p>}<time dateTime={n.createdAt}>{new Date(n.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>
      <div className="notification-actions">{!n.readAt ? <button type="button" className="notification-mark-read" disabled={saving !== null} onClick={() => void markRead(n.id)}><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>{saving === n.id ? 'Saving…' : 'Mark as read'}</button> : <div className="notification-read-actions"><span className="notification-read-label">✓ Read</span><button type="button" className="notification-mark-unread" aria-label="Mark as unread" disabled={saving !== null} onClick={() => void markRead(n.id, true)}><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10h9a6 6 0 0 1 0 12M4 10l4-4M4 10l4 4" transform="translate(0 -3)" /></svg>{saving === n.id ? 'Saving…' : 'Mark as unread'}</button></div>}<button type="button" className="notification-delete" aria-label={`Delete notification: ${n.message}`} disabled={saving !== null} title="Delete notification" onClick={() => void remove(n.id)}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg></button></div></div>
    </li>)}</ul></>}
  </main>;
}
