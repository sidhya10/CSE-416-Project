import { useEffect, useId, useRef, type ReactNode } from 'react';
export default function MobileDialog({ title, busy, onClose, children, closeLabel = 'Close payment popup' }: { closeLabel?: string; title: string; busy: boolean; onClose: () => void; children: ReactNode }) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  const pending = useRef(busy); pending.current = busy;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const buttons = () => [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled)') ?? [])];
    (buttons()[0] ?? panel.current)?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (!pending.current) close.current(); }
      if (event.key !== 'Tab') return;
      const items = buttons(), first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (!panel.current?.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', keydown); document.body.style.overflow = overflow; previous?.focus({ preventScroll: true }); };
  }, []);
  return <div className="settlement-overlay"><div ref={panel} tabIndex={-1} className="settlement-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy}>
    <header><h2 id={titleId}>{title}</h2><button type="button" aria-label={closeLabel} disabled={busy} onClick={onClose}>×</button></header>{children}
  </div></div>;
}
