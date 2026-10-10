import { useEffect, useRef, useState } from 'react';
import { loadReceipt } from '../../api/receipts.api';

export default function ReceiptViewer({ expenseId, name, onClose }: { expenseId: string; name: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [file, setFile] = useState<{ url: string; pdf: boolean }>();
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
    const controller = new AbortController();
    let url: string | undefined;
    loadReceipt(expenseId, controller.signal).then(blob => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob); setFile({ url, pdf: blob.type === 'application/pdf' });
    }).catch(() => { if (!controller.signal.aborted) setError('Could not load the receipt. Close and try again.'); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [expenseId]);
  return <dialog ref={dialog} className="receipt-viewer" aria-label="Receipt attachment" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><h2>Receipt</h2><button type="button" onClick={onClose}>Close</button></header>
    {!file && !error && <p role="status">Loading receipt…</p>}
    {error && <p role="alert">{error}</p>}
    {file && <><a href={file.url} download={name}>Download receipt</a>{file.pdf ? <><p>PDF receipt</p><a href={file.url} target="_blank" rel="noreferrer">Open PDF</a><iframe title="Receipt PDF" src={file.url} /></> : <><div className="receipt-image-scroll"><img src={file.url} alt="Saved receipt" /></div></>}</>}
  </dialog>;
}
