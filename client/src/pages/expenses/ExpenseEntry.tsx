import { useLayoutEffect, useRef, useState, type ChangeEvent } from 'react';
import arrowLeft from '../../assets/expense-arrow-left.svg';
import './expenses.css';
import SplitExpense from './SplitExpense';
import type { PreviewSplit, SplitAssignments, SplitMode } from './split';
import Avatar from '../../components/common/Avatar';

type Member = { id: string; name: string };
type Item = { id: number; name: string; amount: string; quantity: string };
const quantityValue = (value: string) => /^\d{1,3}$/.test(value) && Number(value) > 0 ? Number(value) : null;
const dollars = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const cents = (value: string) => {
  if (!/^\d+(\.\d{0,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(result) && result <= 999999999 ? result : null;
};

function ExpandingNameInput({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const field = ref.current;
    if (!field) return;
    const resize = () => {
      field.style.height = '0px';
      field.style.height = `${field.scrollHeight + field.offsetHeight - field.clientHeight}px`;
    };
    resize();
    // Reflow existing names when the available width changes, too.
    let width = field.getBoundingClientRect().width;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      const nextWidth = field.getBoundingClientRect().width;
      if (nextWidth !== width) { width = nextWidth; resize(); }
    });
    observer?.observe(field);
    return () => observer?.disconnect();
  }, [value]);
  return <textarea ref={ref} className="expense-name-input" aria-label={label} rows={1} placeholder={placeholder} value={value} onChange={event => onChange(event.target.value)} />;
}

function AmountInput({ label, value, onChange, suffix }: { label: string; value: string; onChange: (value: string) => void; suffix?: string }) {
  return <span className="expense-money"><span aria-hidden="true">$</span><input aria-label={label} inputMode="decimal" value={value} onChange={event => onChange(event.target.value)} />{suffix && <span>{suffix}</span>}</span>;
}

export default function ExpenseEntry({ groupName, members, onBack, onConfirm, initialSplit }: { initialSplit?: PreviewSplit; groupName: string; members: Member[]; onBack: () => void; onConfirm: (split: PreviewSplit) => void }) {
  const [splitting, setSplitting] = useState(false);
  const [splitMode, setSplitMode] = useState<SplitMode>(initialSplit?.mode ?? 'equal');
  const [assignments, setAssignments] = useState<SplitAssignments>(initialSplit?.assignments ?? {});
  const [date] = useState(() => initialSplit?.date ?? new Date().toISOString());
  const [name, setName] = useState(initialSplit?.name ?? '');
  const [items, setItems] = useState<Item[]>(initialSplit?.items.map(item => ({ id: item.id, name: item.name, amount: ((item.unitCents ?? item.cents) / 100).toFixed(2), quantity: String(item.quantity ?? 1) })) ?? [{ id: 0, name: '', amount: '', quantity: '1' }]);
  const nextId = useRef(Math.max(0, ...items.map(item => item.id)) + 1);
  const [fees, setFees] = useState({ Tax: ((initialSplit?.feeBreakdown?.tax ?? 0) / 100).toFixed(2), Tip: ((initialSplit?.feeBreakdown?.tip ?? 0) / 100).toFixed(2), Other: ((initialSplit?.feeBreakdown?.other ?? initialSplit?.feeCents ?? 0) / 100).toFixed(2) });
  const [payer, setPayer] = useState(initialSplit?.payerId ?? 'you');
  const [choice, setChoice] = useState(payer);
  const [choosing, setChoosing] = useState(false);
  const [message, setMessage] = useState('');
  const [receiptName, setReceiptName] = useState(initialSplit?.receiptName);
  const camera = useRef<HTMLInputElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const subtotal = items.reduce((sum, item) => sum + (cents(item.amount) ?? 0) * (quantityValue(item.quantity) ?? 0), 0);
  const total = subtotal + Object.values(fees).reduce((sum, value) => sum + (cents(value) ?? 0), 0);
  const displayName = (id: string) => id === 'you' ? 'you' : members.find(member => member.id === id)?.name.split(' ')[0] ?? 'group member';
  const updateItem = (id: number, patch: Partial<Item>) => setItems(previous => previous.map(item => item.id === id ? { ...item, ...patch } : item));
  const removeItem = (id: number) => {
    setItems(previous => previous.filter(item => item.id !== id));
    setAssignments(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => Number(key) !== id)));
  };
  const selectReceipt = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if ((!file.type.startsWith('image/') && file.type !== 'application/pdf') || file.size > 10 * 1024 * 1024) {
      setMessage('Choose an image or PDF up to 10 MB.'); return;
    }
    setReceiptName(file.name);
    setMessage('Receipt selected for this preview. Enter its items below; automatic receipt reading is not connected yet.');
  };
  const continueToSplit = () => {
    if (!name.trim()) { setMessage('Enter an expense name.'); return; }
    if (!items.length) { setMessage('Add at least one item.'); return; }
    if (items.some(item => quantityValue(item.quantity) === null)) {
      setMessage('Enter a whole-number quantity from 1 to 999 for each item.'); return;
    }
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

  if (splitting) return <SplitExpense editing={!!initialSplit} name={name.trim()} items={items.map(item => ({ id: item.id, name: item.name.trim(), cents: cents(item.amount)! * (quantityValue(item.quantity) ?? 0), unitCents: cents(item.amount)!, quantity: quantityValue(item.quantity)! }))}
    feeCents={Object.values(fees).reduce((sum, value) => sum + (cents(value) ?? 0), 0)} members={members} payerId={payer} date={date}
    mode={splitMode} assignments={assignments} onModeChange={setSplitMode} onAssignmentsChange={setAssignments}
    onBack={() => setSplitting(false)} onConfirm={split => onConfirm({ ...split, payments: initialSplit?.payments,
      feeBreakdown: { tax: cents(fees.Tax)!, tip: cents(fees.Tip)!, other: cents(fees.Other)! }, receiptName })} />;

  return <main className={`expense-screen ${choosing ? '' : 'expense-entry-screen'}`}>
    <header className="expense-header"><button type="button" aria-label={choosing ? 'Back to expense' : initialSplit ? 'Back to details' : 'Back to group'} onClick={() => choosing ? setChoosing(false) : onBack()}><img src={arrowLeft} alt="" /></button><h1>{choosing ? 'Who paid?' : initialSplit ? 'Edit expense' : 'Add expense'}</h1></header>
    {choosing ? <>
      <div className="expense-body payer-body">
        <h2>Choose who paid the original bill.</h2>
        <p>You added this expense. The payer can be anyone in the group.</p>
        <div className="payer-options" role="radiogroup" aria-label="Who paid?">
          {members.map((member, index) => <label className={`payer-option ${choice === member.id ? 'selected' : ''}`} key={member.id}>
            <span className={`payer-avatar tone-${index % 4}`} aria-hidden="true"><Avatar name={member.id === 'you' ? 'You' : member.name} /></span>
            <span className="payer-copy"><strong>{member.id === 'you' ? 'You' : displayName(member.id)}</strong><small>{member.id === 'you' ? 'Report creator' : choice === member.id ? `Paid ${dollars(total)}` : 'Group member'}</small></span>
            <input type="radio" name="expense-payer" value={member.id} checked={choice === member.id} onChange={() => setChoice(member.id)} />
          </label>)}
        </div>
        <small>The payer’s own share is excluded from reimbursements.</small>
      </div>
      <footer className="expense-footer"><button className="primary-button" type="button" onClick={() => { setPayer(choice); setChoosing(false); }}>Use {displayName(choice)} as payer</button></footer>
    </> : <>
      <div className="expense-body">
        <section className="expense-details">
          <ExpandingNameInput label="EXPENSE NAME" placeholder="e.g. Dinner at Myers + Chang" value={name} onChange={setName} />
          <p>{groupName} · Created by you</p>
          <button className="expense-outline" type="button" onClick={() => { setChoice(payer); setChoosing(true); }}>Paid by {displayName(payer)} · Change</button>
        </section>
        <section className="expense-receipt" aria-label="Receipt"><div>
          <button className="expense-outline" type="button" onClick={() => camera.current?.click()}>Take photo</button>
          <button className="expense-outline" type="button" onClick={() => upload.current?.click()}>Upload receipt</button>
        </div><input ref={camera} hidden type="file" accept="image/*" capture="environment" onChange={selectReceipt} /><input ref={upload} hidden type="file" accept="image/*,application/pdf" onChange={selectReceipt} />
          {receiptName && <p className="expense-receipt-name">{receiptName}<button type="button" onClick={() => { setReceiptName(undefined); setMessage(''); }}>Remove receipt</button></p>}
        </section>
        <section className="expense-items"><div className="expense-section-title"><h2>Items</h2><p aria-live="polite">{dollars(subtotal)} subtotal</p></div>
          {items.map((item, index) => <div className="expense-item-entry" key={item.id}>
            <div className="expense-item-heading">
              <ExpandingNameInput label={`Item ${index + 1} name`} placeholder="Item name" value={item.name} onChange={name => updateItem(item.id, { name })} />
              <strong aria-label={`Item ${index + 1} total`}>{dollars((cents(item.amount) ?? 0) * (quantityValue(item.quantity) ?? 0))}</strong>
            </div>
            <div className="expense-item">
              <AmountInput label={`Item ${index + 1} amount`} value={item.amount} suffix="each" onChange={amount => updateItem(item.id, { amount })} />
              <div className="expense-quantity" role="group" aria-label={`Item ${index + 1} quantity controls`}>
                <button type="button" aria-label={`Decrease item ${index + 1} quantity`} disabled={(quantityValue(item.quantity) ?? 1) <= 1} onClick={() => updateItem(item.id, { quantity: String(Math.max(1, (quantityValue(item.quantity) ?? 1) - 1)) })}>−</button>
                <input aria-label={`Item ${index + 1} quantity`} inputMode="numeric" value={item.quantity} onChange={event => updateItem(item.id, { quantity: event.target.value })} />
                <button type="button" aria-label={`Increase item ${index + 1} quantity`} disabled={quantityValue(item.quantity) === 999} onClick={() => updateItem(item.id, { quantity: String(Math.min(999, (quantityValue(item.quantity) ?? 0) + 1)) })}>+</button>
              </div>
              <button className="expense-item-remove" type="button" aria-label={`Remove item ${index + 1}`} onClick={() => removeItem(item.id)}>Remove</button>
            </div>
          </div>)}
          {!items.length && <p>Add an item to start your receipt.</p>}
          <button className="expense-add" type="button" onClick={() => { const id = nextId.current++; setItems(previous => [...previous, { id, name: '', amount: '', quantity: '1' }]); }}>+ Add item</button>
        </section>
        <section className="expense-fees"><h2>Tax, tip &amp; fees</h2><div>{(Object.keys(fees) as (keyof typeof fees)[]).map(key => <label key={key}>{key}<AmountInput label={key} value={fees[key]} onChange={value => setFees(previous => ({ ...previous, [key]: value }))} /></label>)}</div></section>
        {message && <p className="form-notice" role="status">{message}</p>}
      </div>
      <footer className="expense-footer"><div className="expense-total"><strong>Total</strong><strong aria-live="polite">{dollars(total)}</strong></div><button className="primary-button" type="button" onClick={continueToSplit}>{initialSplit ? 'Review changes' : 'Continue to split'}</button></footer>
    </>}
  </main>;
}
