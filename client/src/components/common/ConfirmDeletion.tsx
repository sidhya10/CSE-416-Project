import { useEffect, useRef } from 'react';

export default function ConfirmDeletion({ title, description, busy, error, onCancel, onConfirm }: {
  title: string; description: string; busy: boolean; error: string; onCancel: () => void; onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const cancelAction = useRef(onCancel);
  const isBusy = useRef(busy);
  cancelAction.current = onCancel; isBusy.current = busy;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancel.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (!isBusy.current) cancelAction.current(); }
      if (event.key !== 'Tab') return;
      const buttons = [...(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
      const first = buttons[0], last = buttons.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (!dialog.current?.contains(document.activeElement)) { event.preventDefault(); first.focus(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', keydown); document.body.style.overflow = previousOverflow; previous?.focus(); };
  }, []);
  return <div className="deletion-overlay"><div className="deletion-dialog" role="dialog" aria-modal="true" aria-labelledby="deletion-title" aria-describedby="deletion-description" aria-busy={busy} ref={dialog}>
    <h2 id="deletion-title">{title}</h2><p id="deletion-description">{description}</p>
    {error && <p role="alert">{error}</p>}
    <div><button type="button" ref={cancel} disabled={busy} onClick={onCancel}>Cancel</button>
      <button type="button" className="group-danger" disabled={busy} onClick={onConfirm}>{busy ? 'Deleting…' : 'Delete permanently'}</button></div>
  </div></div>;
}
