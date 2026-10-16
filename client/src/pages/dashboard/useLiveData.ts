import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client';

const REFRESH_MS = 15_000;

// Loads data while `active`, then refreshes on an interval and when the browser tab is shown again.
// Only the latest request may update state, and a failed refresh keeps the data already shown.
// `load` must keep the same identity between renders.
export function useLiveData<T>(load: () => Promise<T>, active: boolean) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const latest = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++latest.current;
    try { const value = await load(); if (id === latest.current) { setData(value); setError(''); } }
    catch (failure) { if (id === latest.current) setError(failure instanceof ApiError ? failure.message : 'Unable to reach the server. Try again.'); }
  }, [load]);
  useEffect(() => {
    if (!active) return;
    void refresh();
    const interval = window.setInterval(() => { if (!document.hidden) void refresh(); }, REFRESH_MS);
    const onVisible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [active, refresh]);
  return { data, error, refresh };
}
