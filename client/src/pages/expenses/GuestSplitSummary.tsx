import { createSplitImage } from './splitImage';
import { useEffect, useState } from 'react';
import { formatCents, type PreviewSplit, type SplitMember } from './split';

export default function GuestSplitSummary({ split, members, onEdit }: { split: PreviewSplit; members: SplitMember[]; onEdit: () => void }) {
  const [sharing, setSharing] = useState(false);
  const [status, setStatus] = useState('');
  const [image, setImage] = useState<{ url: string; file: File }>();
  const [imageError, setImageError] = useState('');
  useEffect(() => {
    if (!sharing) return;
    let disposed = false;
    let url: string | undefined;
    setImage(undefined); setImageError('');
    void createSplitImage(split, members).then(blob => {
      if (disposed) return;
      url = URL.createObjectURL(blob);
      setImage({ url, file: new File([blob], 'divvy-split.png', { type: 'image/png' }) });
    }).catch(() => { if (!disposed) setImageError('Could not create an image. You can still copy the text.'); });
    return () => { disposed = true; if (url) URL.revokeObjectURL(url); };
  }, [sharing, split, members]);
  async function shareImage() {
    if (!image) return;
    try { await navigator.share({ files: [image.file], title: 'Divvy split' }); }
    catch (error) { if (!(error instanceof Error && error.name === 'AbortError')) setStatus('Could not share the image. Download it instead.'); }
  }

  const name = (id: string) => members.find(member => member.id === id)?.name ?? 'Participant';
  const payer = name(split.payerId);
  const own = split.shares.find(share => share.memberId === split.payerId);
  const others = split.shares.filter(share => share.memberId !== split.payerId);
  const collecting = others.reduce((total, share) => total + share.reimbursementCents, 0);
  const text = ['Divvy · Quick split', `Receipt total: ${formatCents(split.totalCents)}`, `${payer} paid the bill.`,
    `${payer}’s own share: ${formatCents(own?.totalCents ?? 0)}`, '',
    ...others.map(share => `${name(share.memberId)} → ${payer}: ${formatCents(share.reimbursementCents)}${share.reimbursementCents === 0 ? ' (nothing owed)' : ''}`)].join('\n');
  async function copy() {
    try { await navigator.clipboard.writeText(text); setStatus('Split copied. Paste it into your group chat.'); }
    catch { setStatus('Could not copy automatically. Select and copy the text below.'); }
  }
  async function share() {
    try { await navigator.share({ title: 'Divvy · Quick split', text }); setStatus('Share sheet closed.'); }
    catch (error) { if (!(error instanceof Error && error.name === 'AbortError')) setStatus('Sharing is unavailable. Copy the text below instead.'); }
  }
  return <main className="guest-body"><h1>Your split</h1>
    <section className="guest-total"><span>Receipt total · Paid by {payer}</span><strong>{formatCents(split.totalCents)}</strong></section>
    <section className="guest-payer-summary"><h3>{payer} paid the bill</h3><div><span>Own share</span><strong>{formatCents(own?.totalCents ?? 0)}</strong></div><div><span>To collect from others</span><strong>{formatCents(collecting)}</strong></div></section>
    <h2>Who owes what</h2>
    {others.map(share => <div className="guest-share guest-owed" key={share.memberId}><span><strong>{name(share.memberId)}</strong><small>{share.reimbursementCents > 0 ? `Pays ${payer}` : 'Nothing owed'}</small></span><strong>{formatCents(share.reimbursementCents)}</strong></div>)}

    <p>These are the calculated reimbursements. Guest mode doesn’t track whether anyone has paid.</p>
    <button className="primary-button" type="button" onClick={() => { setSharing(!sharing); setStatus(''); }}>Share split</button>
    {sharing && <section className="guest-share-options" aria-label="Share split"><h3>Send to your group</h3><p>Send an image card or copy the text. No receipt photo is included.</p>{image ? <><img className="guest-share-image" src={image.url} alt="Shareable card showing the receipt total, payer’s share, and who owes whom" /><div className="guest-actions"><a className="expense-outline" href={image.url} download="divvy-split.png">Download image</a>{typeof navigator.share === 'function' && navigator.canShare?.({ files: [image.file] }) && <button type="button" onClick={() => void shareImage()}>Share image</button>}</div></> : <p>{imageError || 'Creating image card…'}</p>}<textarea aria-label="Split text to share" readOnly value={text} rows={8} onFocus={event => event.currentTarget.select()} /><div className="guest-actions">{typeof navigator.share === 'function' && <button type="button" onClick={() => void share()}>Share to an app</button>}<button className="expense-outline guest-copy-text" type="button" onClick={() => void copy()}>Copy text</button></div>{status && <p role="status">{status}</p>}</section>}
    <button className="expense-outline guest-edit-split" type="button" onClick={onEdit}>Edit receipt or split</button>
    <p>This summary lasts only while guest mode is open.</p>
  </main>;
}
