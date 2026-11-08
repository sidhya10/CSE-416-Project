import { useEffect, useRef, useState, type ReactNode } from 'react';

const EDGE_START_PX = 36;
const BACK_DISTANCE_PX = 72;
const REFRESH_DISTANCE_PX = 84;
const reloadPage = () => new Promise<void>(() => {
  // Paint the loading state before navigation; keep it visible until the page unloads.
  requestAnimationFrame(() => requestAnimationFrame(() => window.location.reload()));
});

const hiddenByAncestor = (element: Element) => !!element.closest('[hidden]');

function findBackButton(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLButtonElement>('button')].find(button => {
    if (button.disabled || hiddenByAncestor(button)) return false;
    const name = `${button.getAttribute('aria-label') ?? ''} ${button.textContent ?? ''}`;
    return /\bback\b/i.test(name) || button.classList.contains('cb-back');
  });
}

function isAtTop(target: EventTarget | null, root: HTMLElement) {
  let element = target instanceof Element ? target : null;
  while (element && element !== root) {
    const style = window.getComputedStyle(element);
    if (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight) return element.scrollTop <= 0;
    element = element.parentElement;
  }
  return root.scrollTop <= 0;
}

export default function MobileGestureShell({ children, onRefresh = reloadPage }: {
  children: ReactNode;
  onRefresh?: () => void | Promise<void>;
}) {
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef({ x: 0, y: 0, edge: false, canPull: false, pull: 0 });
  const [refreshError, setRefreshError] = useState(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const element = root.current;
    if (!element) return;

    const start = (event: TouchEvent) => {
      if (event.touches.length !== 1 || refreshing) return;
      setRefreshError(false);
      const touch = event.touches[0]!;
      gesture.current = { x: touch.clientX, y: touch.clientY, edge: touch.clientX <= EDGE_START_PX, canPull: isAtTop(event.target, element), pull: 0 };
    };
    const move = (event: TouchEvent) => {
      if (event.touches.length !== 1 || refreshing) return;
      const touch = event.touches[0]!;
      const dx = touch.clientX - gesture.current.x;
      const dy = touch.clientY - gesture.current.y;
      if (!gesture.current.canPull) return;
      if (dy <= 0 || Math.abs(dx) > Math.max(24, dy * .65)) {
        gesture.current.pull = 0; setPull(0); return;
      }
      const distance = Math.min(108, dy * .65);
      gesture.current.pull = distance;
      setPull(distance);
      if (dy > 12) event.preventDefault();
    };
    const end = (event: TouchEvent) => {
      if (refreshing) return;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - gesture.current.x;
      const dy = touch.clientY - gesture.current.y;
      const shouldRefresh = gesture.current.canPull && gesture.current.pull >= REFRESH_DISTANCE_PX;
      const shouldGoBack = gesture.current.edge && dx >= BACK_DISTANCE_PX && Math.abs(dy) < 64 && dx > Math.abs(dy) * 1.4;
      gesture.current.pull = 0;
      setPull(0);
      if (shouldRefresh) {
        setRefreshing(true);
        void Promise.resolve().then(onRefresh).catch(() => setRefreshError(true)).finally(() => setRefreshing(false));
      } else if (shouldGoBack) {
        findBackButton(element)?.click();
      }
    };
    const cancel = () => { gesture.current.pull = 0; setPull(0); };

    element.addEventListener('touchstart', start, { passive: true });
    element.addEventListener('touchmove', move, { passive: false });
    element.addEventListener('touchend', end, { passive: true });
    element.addEventListener('touchcancel', cancel, { passive: true });
    return () => {
      element.removeEventListener('touchstart', start);
      element.removeEventListener('touchmove', move);
      element.removeEventListener('touchend', end);
      element.removeEventListener('touchcancel', cancel);
    };
  }, [onRefresh, refreshing]);

  const ready = pull >= REFRESH_DISTANCE_PX;
  return <div className="device" ref={root}>
    <div className={`pull-refresh${pull || refreshing ? ' visible' : ''}${pull && !refreshing ? ' dragging' : ''}${refreshing ? ' refreshing' : ''}`}
      style={{ transform: `translate3d(-50%, ${refreshing ? 16 : Math.min(72, pull * .8) - 48}px, 0)` }} aria-hidden="true">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ transform: refreshing ? undefined : `rotate(${pull * 3}deg)` }}>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity=".18" />
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${refreshing ? 42 : Math.max(3, Math.min(48, pull / REFRESH_DISTANCE_PX * 48))} 57`} />
      </svg>
    </div>
    <span className="refresh-status" role={refreshError || refreshing || ready ? 'status' : undefined} aria-live="polite">{refreshError ? 'Could not refresh. Pull down to try again.' : refreshing ? 'Refreshing…' : ready ? 'Release to refresh' : ''}</span>
    {children}
  </div>;
}
