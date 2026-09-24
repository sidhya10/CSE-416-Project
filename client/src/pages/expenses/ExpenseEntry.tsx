import { useRef, useState, type ChangeEvent } from 'react';
import arrowLeft from '../../assets/expense-arrow-left.svg';
import './expenses.css';
import SplitExpense from './SplitExpense';
import type { PreviewSplit, SplitAssignments, SplitMode } from './split';
import Avatar from '../../components/common/Avatar';

type Member = { id: string; name: string };
type Item = { id: number; name: string; amount: string };
const dollars = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const cents = (value: string) => {
  if (!/^\d+(\.\d{0,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(result) && result <= 999999999 ? result : null;
};

function AmountInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <span className="expense-money"><span aria-hidden="true">$</span><input aria-label={label} inputMode="decimal" value={value} onChange={event => onChange(event.target.value)} /></span>;
}

export default function ExpenseEntry({ groupName, members, onBack, onConfirm }: { groupName: string; members: Member[]; onBack: () => void; onConfirm: (split: PreviewSplit) => void }) {
  const [splitting, setSplitting] = useState(false);
  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [assignments, setAssignments] = useState<SplitAssignments>({});
  const [date] = useState(() => new Date().toISOString());
  const [name, setName] = useState('');
  const [items, setItems] = useState<Item[]>([{ id: 0, name: '', amount: '' }]);
  const nextId = useRef(1);
  const [fees, setFees] = useState({ Tax: '0.00', Tip: '0.00', Other: '0.00' });
  const [payer, setPayer] = useState('you');
  const [choice, setChoice] = useState(payer);
  const [choosing, setChoosing] = useState(false);
  const [message, setMessage] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const subtotal = items.reduce((sum, item) => sum + (cents(item.amount) ?? 0), 0);
  const total = subtotal + Object.values(fees).reduce((sum, value) => sum + (cents(value) ?? 0), 0);
  const displayName = (id: string) => id === 'you' ? 'you' : members.find(member => member.id === id)?.name.split(' ')[0] ?? 'group member';
  const updateItem = (id: number, patch: Partial<Item>) => setItems(previous => previous.map(item => item.id === id ? { ...item, ...patch } : item));
  const selectReceipt = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if ((!file.type.startsWith('image/') && file.type !== 'application/pdf') || file.size > 10 * 1024 * 1024) {
      setMessage('Choose an image or PDF up to 10 MB.'); return;
    }
    setReceipt(file);
    setMessage('Receipt selected for this preview. Enter its items below; automatic receipt reading is not connected yet.');
  };
  const continueToSplit = () => {
    if (!name.trim()) { setMessage('Enter an expense name.'); return; }
    if (items.some(item => !item.name.trim() || cents(item.amount) === null || cents(item.amount) === 0)) {
      setMessage('Give each item a name and a positive amount with up to two decimal places.'); return;
    }
    if (Object.values(fees).some(value => cents(value) === null)) {
      setMessage('Enter non-negative tax, tip, and fees with up to two decimal places.'); return;
    }
    if (!Number.isSafeInteger(total)) { setMessage('The expense total is too large.'); return; }
    setAssignments(previous => Object.fromEntries(items.map(item => [item.id, previous[item.id] ?? members.map(member => member.id)])));
    setMessage('');
    setSplitting(true);
  };

  if (splitting) return <SplitExpense name={name.trim()} items={items.map(item => ({ id: item.id, name: item.name.trim(), cents: cents(item.amount)! }))}
    feeCents={Object.values(fees).reduce((sum, value) => sum + (cents(value) ?? 0), 0)} members={members} payerId={payer} date={date}
    mode={splitMode} assignments={assignments} onModeChange={setSplitMode} onAssignmentsChange={setAssignments}
    onBack={() => setSplitting(false)} onConfirm={onConfirm} />;

  return <main className="expense-screen">
    <header className="expense-header"><button type="button" aria-label={choosing ? 'Back to expense' : 'Back to group'} onClick={() => choosing ? setChoosing(false) : onBack()}><img src={arrowLeft} alt="" /></button><h1>{choosing ? 'Who paid?' : 'Add expense'}</h1></header>
    {choosing ? <>
      <div className="expense-body payer-body">
        <h2>Choose who paid the original bill.</h2>
        <p>You added this expense. The payer can be anyone in the group.</p>
        <div className="payer-options" role="radiogroup" aria-label="Who paid?">
          {members.map((member, index) => <label className={`payer-option ${choice === member.id ? 'selected' : ''}`} key={member.id}>
            <span className={`payer-avatar tone-${index % 4}`} aria-hidden="true"><Avatar name={member.id === 'you' ? 'Vivian' : member.name} /></span>
            <span className="payer-copy"><strong>{member.id === 'you' ? 'Vivian (you)' : displayName(member.id)}</strong><small>{member.id === 'you' ? 'Report creator' : choice === member.id ? `Paid ${dollars(total)}` : 'Group member'}</small></span>
            <input type="radio" name="expense-payer" value={member.id} checked={choice === member.id} onChange={() => setChoice(member.id)} />
          </label>)}
        </div>
        <small>The payer’s own share is excluded from reimbursements.</small>
      </div>
      <footer className="expense-footer"><button className="primary-button" type="button" onClick={() => { setPayer(choice); setChoosing(false); }}>Use {displayName(choice)} as payer</button></footer>
    </> : <>
      <div className="expense-body">
        <section className="expense-details">
          <label htmlFor="expense-name">EXPENSE NAME</label><input id="expense-name" placeholder="e.g. Dinner at Myers + Chang" value={name} onChange={event => setName(event.target.value)} />
          <p>{groupName} · Created by Vivian (you)</p>
          <button className="expense-outline" type="button" onClick={() => { setChoice(payer); setChoosing(true); }}>Paid by {displayName(payer)} · Change</button>
        </section>
        <section className="expense-receipt"><h2>Start with a receipt</h2><div>
          <button className="expense-outline" type="button" onClick={() => camera.current?.click()}>Take photo</button>
          <button className="expense-outline" type="button" onClick={() => upload.current?.click()}>Upload receipt</button>
        </div><input ref={camera} hidden type="file" accept="image/*" capture="environment" onChange={selectReceipt} /><input ref={upload} hidden type="file" accept="image/*,application/pdf" onChange={selectReceipt} />
          {receipt && <p className="expense-receipt-name">{receipt.name}<button type="button" onClick={() => { setReceipt(null); setMessage(''); }}>Remove receipt</button></p>}
        </section>
        <section className="expense-items"><div className="expense-section-title"><h2>Items</h2><p aria-live="polite">{dollars(subtotal)} subtotal</p></div>
          {items.map((item, index) => <div className="expense-item" key={item.id}><input aria-label={`Item ${index + 1} name`} placeholder="Item name" value={item.name} onChange={event => updateItem(item.id, { name: event.target.value })} /><AmountInput label={`Item ${index + 1} amount`} value={item.amount} onChange={amount => updateItem(item.id, { amount })} /></div>)}
          <button className="expense-add" type="button" onClick={() => { const id = nextId.current++; setItems(previous => [...previous, { id, name: '', amount: '' }]); }}>+ Add item</button>
        </section>
        <section className="expense-fees"><h2>Tax, tip &amp; fees</h2><div>{(Object.keys(fees) as (keyof typeof fees)[]).map(key => <label key={key}>{key}<AmountInput label={key} value={fees[key]} onChange={value => setFees(previous => ({ ...previous, [key]: value }))} /></label>)}</div></section>
        {message && <p className="form-notice" role="status">{message}</p>}
      </div>
      <footer className="expense-footer"><div className="expense-total"><strong>Total</strong><strong aria-live="polite">{dollars(total)}</strong></div><button className="primary-button" type="button" onClick={continueToSplit}>Continue to split</button><small>Choose who owes what on the next screen.</small></footer>
    </>}
  </main>;
}
