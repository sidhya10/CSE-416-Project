import { useEffect, useRef } from 'react';

const refreshEvent = 'cse416:pull-refresh';
type RefreshEvent = CustomEvent<{ tasks: Promise<unknown>[] }>;

/** Reload data in place, keeping navigation and component state intact. */
export async function refreshCurrentPage() {
  const tasks: Promise<unknown>[] = [];
  window.dispatchEvent(new CustomEvent(refreshEvent, { detail: { tasks } }));
  const results = await Promise.allSettled(tasks);
  if (results.some(result => result.status === 'rejected')) throw new Error('Refresh failed');
}

export function usePullRefresh(refresh: () => unknown | Promise<unknown>, active = true) {
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    if (!active) return;
    const onRefresh = (event: Event) => {
      (event as RefreshEvent).detail.tasks.push(Promise.resolve().then(() => latest.current()));
    };
    window.addEventListener(refreshEvent, onRefresh);
    return () => window.removeEventListener(refreshEvent, onRefresh);
  }, [active]);
}
