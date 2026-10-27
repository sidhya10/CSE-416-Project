import GuestSplitSummary from './GuestSplitSummary';
import type { GuestReceiptCache } from '../../api/receipts.api';
import { useRef, useState } from 'react';
import ExpenseEntry from './ExpenseEntry';
import { type PreviewSplit } from './split';
import './guest.css';

export default function GuestSplit({ onClose }: { onClose: () => void }) {
  const [members, setMembers] = useState(() => Array.from({ length: 2 }, (_, i) => ({ id: `guest-${i}`, name: '' })));
  const receiptCache = useRef<GuestReceiptCache>(new Map());
  const nextMemberId = useRef(2);
  const [stage, setStage] = useState<'people' | 'entry' | 'result'>('people');
  const [result, setResult] = useState<PreviewSplit>();
  const [closing, setClosing] = useState(false);
  return <div className="guest-split">
    <div className="guest-banner"><span>Guest mode · Nothing is saved</span><button type="button" onClick={() => setClosing(true)}>Exit</button></div>
    {closing && <section className="guest-exit" role="alertdialog" aria-modal="true" aria-labelledby="guest-exit-title"><h2 id="guest-exit-title">Discard this quick split?</h2><p>Your receipt, names, and calculations will be cleared.</p><button type="button" onClick={() => setClosing(false)}>Keep splitting</button><button type="button" onClick={() => { receiptCache.current.clear(); onClose(); }}>Discard and exit</button></section>}
    <div inert={closing}>
    {stage === 'people' ? <main className="guest-body"><h1>Split a receipt</h1><p>No account, group, or budget needed. Enter the names of everyone sharing the receipt.</p><h2>Who’s sharing?</h2>
      <p className="guest-people-hint">{members.length} people · Edit names or remove someone below.</p>
      {members.map((member, index) => <div className="guest-person" key={member.id}>
        <label htmlFor={`name-${member.id}`} className="guest-person-number"><span aria-hidden="true">{index + 1}</span><span className="guest-visually-hidden">Person {index + 1}</span></label>
        <input id={`name-${member.id}`} aria-label={`Person ${index + 1}`} maxLength={40} placeholder="Enter name" value={member.name} onChange={e => setMembers(previous => previous.map(m => m.id === member.id ? { ...m, name: e.target.value } : m))} />
        <button className="guest-remove-person" type="button" aria-label={`Remove person ${index + 1}: ${member.name || 'unnamed'}`} title={members.length <= 2 ? 'At least two people are needed' : `Remove ${member.name || 'person'}`} disabled={members.length <= 2} onClick={() => setMembers(previous => previous.filter(m => m.id !== member.id))}><span aria-hidden="true">×</span></button>
      </div>)}
      <div className="guest-actions"><button className="guest-add-person" type="button" disabled={members.length >= 26} onClick={() => {
        const id = `guest-${nextMemberId.current++}`;
        setMembers(previous => [...previous, { id, name: '' }]);
      }}>+ Add person</button></div>
      {members.length <= 2 && <p className="guest-people-hint">Keep at least two people to split a receipt.</p>}
      <p>Closing guest mode or refreshing the page clears your split.</p><button className="primary-button" disabled={members.some(m => !m.name.trim())} onClick={() => { setMembers(members.map(m => ({ ...m, name: m.name.trim() }))); setStage('entry'); }}>Continue to receipt</button>
    </main> : stage === 'entry' ? <ExpenseEntry guest guestReceiptCache={receiptCache.current} groupName="Temporary receipt" members={members} initialSplit={result} onBack={() => { setResult(undefined); setStage('people'); }} onConfirm={split => { setResult(split); setStage('result'); }} /> : result && <GuestSplitSummary split={result} members={members} onEdit={() => setStage('entry')} />}
    </div>
  </div>;
}
