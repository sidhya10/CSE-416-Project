import { useEffect } from 'react';
import { settlementsApi } from '../../api/settlements.api';
import { useLiveData } from '../dashboard/useLiveData';

export default function NotificationsNavButton({ selected, onClick }: { selected: boolean; onClick: () => void }) {
  const { data, refresh } = useLiveData(settlementsApi.notifications, true);
  const unread = data?.notices.filter(n => !n.readAt).length ?? 0;
  useEffect(() => {
    const update = () => { void refresh(); };
    window.addEventListener('cse416:settlements', update);
    return () => window.removeEventListener('cse416:settlements', update);
  }, [refresh]);
  return <button type="button" className={selected ? 'tab active' : 'tab'} aria-current={selected ? 'page' : undefined} aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} onClick={onClick}>
    <span className="tab-glyph notifications-nav-icon" aria-hidden="true"><svg width="22" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>{unread > 0 && <span className="notifications-nav-badge">{unread > 99 ? '99+' : unread}</span>}</span><span>Notifications</span>
  </button>;
}
