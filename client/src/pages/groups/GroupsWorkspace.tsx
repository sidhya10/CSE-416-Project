import { useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import './groups.css';

type GroupType = 'General' | 'Trip' | 'Recurring';
type Friend = { id: string; name: string; handle: string; color: string };
type PlannedExpense = { id: number; title: string; amount: number };
type Frequency = 'Weekly' | 'Monthly' | 'Quarterly' | 'Semi-yearly' | 'Yearly' | 'Custom';
type IntervalUnit = 'days' | 'weeks' | 'months' | 'years';
type Allocation = { payerId: string; shares: Record<string, number> };
type RecurringBill = { id: number; title: string; amount: number; startDate: string; frequency: Frequency;
  customEvery: number; customUnit: IntervalUnit; cycles: Record<string, Allocation> };
type Group = {
  id: number; name: string; description: string; type: GroupType; members: string[];
  color: string; photo: string | null; startDate: string; endDate: string;
  privateBudget: number | null; plans: PlannedExpense[]; bills: RecurringBill[]; archived?: boolean;
};
type Screen = 'list' | 'friends' | 'select' | 'customize' | 'detail' | 'settings' | 'add-members' | 'bill' | 'plan';

const friends: Friend[] = [
  { id: 'nicole', name: 'Nicole Chen', handle: '@nicolec', color: 'mint' },
  { id: 'eva', name: 'Eva Lin', handle: '@evalin', color: 'peach' },
  { id: 'sidhya', name: 'Sidhya Shah', handle: '@sidhya10', color: 'blue' },
  { id: 'jordan', name: 'Jordan Lee', handle: '@jordanlee', color: 'sand' },
  { id: 'maya', name: 'Maya Patel', handle: '@mayap', color: 'mint' },
  { id: 'alex', name: 'Alex Kim', handle: '@alexk', color: 'sand' },
  { id: 'priya', name: 'Priya Shah', handle: '@priyashah', color: 'blue' },
];

const initialGroups: Group[] = [
  { id: 1, name: 'Boston weekend', description: 'Weekend trip with friends', type: 'Trip',
    members: ['nicole', 'eva', 'sidhya'], color: 'gold', photo: null, startDate: '2026-10-10', endDate: '2026-10-13',
    privateBudget: null, plans: [], bills: [] },
  { id: 2, name: 'Apartment 4B', description: 'Shared apartment costs, groceries, and utilities.', type: 'General',
    members: ['nicole', 'eva'], color: 'green', photo: null, startDate: '', endDate: '',
    privateBudget: null, plans: [], bills: [] },
  { id: 3, name: 'WiCS board', description: 'Shared event costs for the board.', type: 'General',
    members: ['nicole', 'eva', 'sidhya', 'jordan', 'maya', 'alex'], color: 'blue', photo: null,
    startDate: '', endDate: '', privateBudget: null, plans: [], bills: [] },
  { id: 4, name: 'Apartment bills', description: 'Shared rent, internet, and utilities.', type: 'Recurring',
    members: ['nicole', 'eva'], color: 'gold', photo: null, startDate: '', endDate: '',
    privateBudget: null, plans: [],
    bills: [{ id: 1, title: 'Rent', amount: 1800, startDate: '2026-10-01', frequency: 'Monthly', customEvery: 1, customUnit: 'months', cycles: {} },
      { id: 2, title: 'Internet', amount: 75, startDate: '2026-10-15', frequency: 'Monthly', customEvery: 1, customUnit: 'months', cycles: {} }] },
];

const money = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
const dateLabel = (value: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
const monthLabel = (value: Date) => value.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const isoDate = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
const parseDate = (value: string) => new Date(`${value}T12:00:00`);
const occurrence = (bill: RecurringBill, index: number) => {
  const start = parseDate(bill.startDate);
  const every = bill.frequency === 'Custom' ? bill.customEvery : bill.frequency === 'Quarterly' ? 3 : bill.frequency === 'Semi-yearly' ? 6 : 1;
  const unit = bill.frequency === 'Custom' ? bill.customUnit : bill.frequency === 'Weekly' ? 'weeks' : bill.frequency === 'Yearly' ? 'years' : 'months';
  if (unit === 'days' || unit === 'weeks') { start.setDate(start.getDate() + index * every * (unit === 'weeks' ? 7 : 1)); return start; }
  const months = index * every * (unit === 'years' ? 12 : 1);
  const first = new Date(start.getFullYear(), start.getMonth() + months, 1, 12);
  return new Date(first.getFullYear(), first.getMonth(), Math.min(start.getDate(), new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()), 12);
};
const occurrencesInMonth = (bill: RecurringBill, month: Date) => {
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 1, 12);
  const dates: string[] = [];
  for (let i = 0; i < 1500; i++) {
    const date = occurrence(bill, i);
    if (date >= end) break;
    if (date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth()) dates.push(isoDate(date));
  }
  return dates;
};
const findCycleIndex = (bill: RecurringBill, date: string) => {
  for (let i = 0; i < 1500; i++) if (isoDate(occurrence(bill, i)) === date) return i;
  return 0;
};
const defaultAllocation = (bill: RecurringBill, members: Friend[]): Allocation => {
  const cents = Math.round(bill.amount * 100);
  const each = Math.floor(cents / members.length);
  return { payerId: 'you', shares: Object.fromEntries(members.map((member, index) => [member.id, each + (index < cents % members.length ? 1 : 0)])) };
};
const initialDraft = (): Group => ({ id: 0, name: '', description: '', type: 'General', members: [], color: 'gold',
  photo: null, startDate: '', endDate: '', privateBudget: null, plans: [], bills: [] });

function Avatar({ name, color = 'mint', photo, size = 'normal' }: { name: string; color?: string; photo?: string | null; size?: 'normal' | 'large' }) {
  return <span className={`group-avatar ${color} ${size}`}>{photo ? <img src={photo} alt="" /> : name.trim().charAt(0).toUpperCase() || '?'}</span>;
}

function Header({ title, subtitle, back, trailing }: { title: string; subtitle?: string; back?: () => void; trailing?: ReactNode }) {
  return <header className="group-header">
    {back && <button className="group-back" type="button" onClick={back} aria-label="Back">‹</button>}
    <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{trailing}
  </header>;
}

export default function GroupsWorkspace({ onRootChange }: { onRootChange: (atRoot: boolean) => void }) {
  const [screen, setScreen] = useState<Screen>('list');
  const [groups, setGroups] = useState<Group[]>(initialGroups);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Group>(initialDraft);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [knownFriends, setKnownFriends] = useState<string[]>(['nicole', 'eva', 'sidhya', 'jordan', 'maya']);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const [billId, setBillId] = useState<number | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date(2026, 9, 1));
  const [plannedTitle, setPlannedTitle] = useState('');
  const [plannedAmount, setPlannedAmount] = useState('');
  const [newBill, setNewBill] = useState({ title: '', amount: '', startDate: '', frequency: 'Monthly' as Frequency, customEvery: '1', customUnit: 'months' as IntervalUnit });
  const [addingBill, setAddingBill] = useState(false);
  const [cycleIndex, setCycleIndex] = useState(0);
  const [allocationDraft, setAllocationDraft] = useState<Allocation | null>(null);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Group | null>(null);
  const swipeStart = useRef<{ id: number; x: number; y: number } | null>(null);
  const suppressCardClick = useRef<number | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const groupMembers = (group: Group) => [{ id: 'you', name: 'You', handle: '@you', color: 'green' }, ...group.members.map(id => friends.find(friend => friend.id === id)).filter((friend): friend is Friend => Boolean(friend))];
  const active = groups.find(group => group.id === activeId);
  const bill = active?.bills.find(item => item.id === billId);
  const cycleDate = bill ? isoDate(occurrence(bill, cycleIndex)) : '';
  const members = active ? groupMembers(active) : [];
  const allocation = bill ? bill.cycles[cycleDate] ?? defaultAllocation(bill, members) : null;
  const cycleEntries = active?.bills.flatMap(item => occurrencesInMonth(item, calendarMonth).map(date => ({ item, date }))) ?? [];

  const go = (next: Screen) => { setScreen(next); setQuery(''); setMessage(''); onRootChange(next === 'list'); };
  const updateGroup = (patch: Partial<Group>) => {
    if (editing && activeId !== null) setGroups(previous => previous.map(group => group.id === activeId ? { ...group, ...patch } : group));
    else setDraft(previous => ({ ...previous, ...patch }));
  };
  const enterGroup = (id: number) => { setActiveId(id); setEditing(false); go('detail'); };
  const archiveGroup = (group: Group) => {
    setGroups(previous => previous.map(item => item.id === group.id ? { ...item, archived: true } : item));
    setOpenActionsId(null);
    setMessage(`${group.name} archived. You can restore it below.`);
  };
  const restoreGroup = (group: Group) => {
    setGroups(previous => previous.map(item => item.id === group.id ? { ...item, archived: false } : item));
    setMessage(`${group.name} restored.`);
  };
  const confirmDelete = () => {
    if (!pendingDelete) return;
    const deleted = pendingDelete;
    setGroups(previous => previous.filter(group => group.id !== deleted.id));
    setPendingDelete(null);
    setOpenActionsId(null);
    if (activeId === deleted.id) { setActiveId(null); go('list'); }
    setMessage(`${deleted.name} deleted from this preview.`);
  };
  const finishSwipe = (id: number, x: number, y: number) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || start.id !== id) return;
    const dx = x - start.x;
    if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(y - start.y)) return;
    suppressCardClick.current = id;
    window.setTimeout(() => { if (suppressCardClick.current === id) suppressCardClick.current = null; }, 0);
    setOpenActionsId(dx < 0 ? id : null);
  };
  const openBill = (id: number, index = 0) => { setBillId(id); setCycleIndex(index); setAllocationDraft(null); go('bill'); };
  const toggle = (id: string) => setSelected(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]);
  const startCreate = () => { setDraft(initialDraft()); setSelected(['nicole', 'eva', 'sidhya']); setEditing(false); go('select'); };
  const createGroup = (event: FormEvent) => {
    event.preventDefault();
    if (draft.type === 'Trip' && (!draft.startDate || !draft.endDate || draft.endDate < draft.startDate)) {
      setMessage('Choose valid trip start and end dates.'); return;
    }
    const group = { ...draft, id: Date.now(), name: draft.name.trim(), description: draft.description.trim(), members: selected };
    setGroups(previous => [group, ...previous]); setActiveId(group.id); go('detail');
  };
  const choosePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) { setMessage('Choose an image smaller than 5 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => updateGroup({ photo: typeof reader.result === 'string' ? reader.result : null });
    reader.readAsDataURL(file);
  };
  const listFriends = friends.filter(friend => knownFriends.includes(friend.id) && `${friend.name} ${friend.handle}`.toLowerCase().includes(query.toLowerCase()));
  const addPlan = (event: FormEvent) => {
    event.preventDefault();
    const amount = Number(plannedAmount);
    if (!active || !plannedTitle.trim() || amount <= 0) return;
    setGroups(previous => previous.map(group => group.id === active.id
      ? { ...group, plans: [...group.plans, { id: Date.now(), title: plannedTitle.trim(), amount }] } : group));
    setPlannedTitle(''); setPlannedAmount(''); go('detail');
  };
  const addBill = (event: FormEvent) => {
    event.preventDefault();
    if (!active || !newBill.startDate || Number(newBill.amount) <= 0 || Number(newBill.customEvery) < 1) return;
    const item: RecurringBill = { id: Date.now(), title: newBill.title.trim(), amount: Number(newBill.amount),
      startDate: newBill.startDate, frequency: newBill.frequency, customEvery: Number(newBill.customEvery), customUnit: newBill.customUnit, cycles: {} };
    setGroups(previous => previous.map(group => group.id === active.id ? { ...group, bills: [...group.bills, item] } : group));
    setAddingBill(false); setNewBill({ title: '', amount: '', startDate: '', frequency: 'Monthly', customEvery: '1', customUnit: 'months' });
    openBill(item.id);
  };
  const saveAllocation = (event: FormEvent) => {
    event.preventDefault();
    if (!active || !bill || !allocationDraft) return;
    if (Object.values(allocationDraft.shares).some(value => !Number.isInteger(value) || value < 0) ||
      members.reduce((sum, member) => sum + (allocationDraft.shares[member.id] || 0), 0) !== Math.round(bill.amount * 100)) {
      setMessage(`Shares must add up to ${money(bill.amount)}.`); return;
    }
    setGroups(previous => previous.map(group => group.id !== active.id ? group : { ...group,
      bills: group.bills.map(item => item.id !== bill.id ? item : { ...item, cycles: { ...item.cycles, [cycleDate]: allocationDraft } }) }));
    setAllocationDraft(null); setMessage('Payment plan saved for this cycle.');
  };

  return <main className="groups-workspace">
    {screen === 'list' && <>
      <Header title="Groups" subtitle="Split, plan, and settle with people you trust" />
      <label className="group-search"><span aria-hidden="true">⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search groups" aria-label="Search groups" /></label>
      <div className="group-actions"><button type="button" onClick={() => go('friends')}>+&nbsp; Find friends</button><button type="button" onClick={startCreate}>+&nbsp; New group</button></div>
      <section className="group-balance"><small>Across all groups · Sample data</small><div><strong>$64.80 owed to you</strong><strong>$38.20 you owe</strong></div></section>
      <h2 className="group-section-title">Your groups</h2>
      {message && <p className="group-notice" role="status">{message}</p>}
      <div className="group-list">{groups.filter(group => !group.archived && group.name.toLowerCase().includes(query.toLowerCase())).map(group =>
        <div className={`group-list-row${openActionsId === group.id ? ' is-open' : ''}`} key={group.id}
          onPointerDown={event => { if (event.target instanceof Element && event.target.closest('.group-list-card')) swipeStart.current = { id: group.id, x: event.clientX, y: event.clientY }; }}
          onPointerMove={event => { const start = swipeStart.current; if (start?.id === group.id && Math.abs(event.clientX - start.x) > 12 && Math.abs(event.clientX - start.x) > Math.abs(event.clientY - start.y)) event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerUp={event => finishSwipe(group.id, event.clientX, event.clientY)} onPointerCancel={() => { swipeStart.current = null; }}>
          <div className="group-card-actions"><button type="button" aria-label={`Archive ${group.name}`} onClick={() => archiveGroup(group)}>Archive</button>
            <button type="button" aria-label={`Delete ${group.name}`} onClick={() => { setPendingDelete(group); setOpenActionsId(null); }}>Delete</button></div>
          <div className="group-card-foreground"><button className="group-list-card" type="button" onClick={() => {
            if (suppressCardClick.current === group.id) { suppressCardClick.current = null; return; }
            if (openActionsId === group.id) { setOpenActionsId(null); return; }
            enterGroup(group.id);
          }}><Avatar name={group.name} color={group.color} photo={group.photo} />
              <span><strong>{group.name}</strong><small>{group.members.length + 1} members · {group.type}</small><em>{group.description}</em></span></button>
            <button className="group-card-menu" type="button" aria-label={`Actions for ${group.name}`} aria-expanded={openActionsId === group.id}
              onClick={() => setOpenActionsId(openActionsId === group.id ? null : group.id)}>›</button></div>
        </div>)}</div>
      {groups.some(group => group.archived) && <section className="archived-groups"><h2 className="group-section-title">Archived groups</h2>
        {groups.filter(group => group.archived && group.name.toLowerCase().includes(query.toLowerCase())).map(group =>
          <div className="archived-group-row" key={group.id}><span>{group.name}</span><button type="button" onClick={() => restoreGroup(group)}>Restore {group.name}</button></div>)}
      </section>}
    </>}
    {screen === 'friends' && <>
      <Header title="Find friends" subtitle="Search by username, email, or phone number" back={() => go('list')} />
      <label className="group-search"><span aria-hidden="true">⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="@username, email, or phone" aria-label="Search friends" /></label>
      <h2 className="group-overline">SEARCH RESULTS · SAMPLE CONTACTS</h2>
      {friends.filter(friend => `${friend.name} ${friend.handle}`.toLowerCase().includes(query.toLowerCase())).map(friend =>
        <div className="friend-card" key={friend.id}><Avatar name={friend.name} color={friend.color} /><span><strong>{friend.name}</strong><small>{friend.handle}</small></span>
          {knownFriends.includes(friend.id) ? <span className="friend-status">Friends</span>
            : <button type="button" onClick={() => setKnownFriends(previous => [...previous, friend.id])}>Add</button>}</div>)}
      <p className="group-caption">Friend changes in this preview are saved only for this session.</p>
    </>}
    {screen === 'select' && <>
      <header className="group-centered-header"><button type="button" onClick={() => go('list')}>Cancel</button><h1>Select friends</h1></header>
      <label className="group-search"><span aria-hidden="true">⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search your friends" aria-label="Search your friends" /></label>
      <h2 className="group-overline">SELECTED · {selected.length}</h2>
      <div className="selected-friends">{selected.map(id => { const friend = friends.find(item => item.id === id); return friend &&
        <div key={id}><Avatar name={friend.name} color={friend.color} /><small>{friend.name.split(' ')[0]}</small></div>; })}</div>
      <h2 className="group-overline">ALL FRIENDS</h2>
      {listFriends.map(friend => <button type="button" className="friend-card select-friend" key={friend.id} onClick={() => toggle(friend.id)}>
        <Avatar name={friend.name} color={friend.color} /><span><strong>{friend.name}</strong><small>{friend.handle}</small></span>
        <span className={selected.includes(friend.id) ? 'selection checked' : 'selection'}>{selected.includes(friend.id) ? '✓' : ''}</span></button>)}
      <button className="group-primary group-bottom-action" type="button" onClick={() => { setDraft(previous => ({ ...previous, members: selected })); go('customize'); }}>Next: customize group</button>
    </>}
    {screen === 'customize' && <>
      <Header title="Customize group" subtitle="You can change these settings later." back={() => go('select')} />
      <div className="group-photo-editor"><button type="button" onClick={() => photoInput.current?.click()} aria-label="Add group photo">
        <Avatar name={draft.name || 'B'} color={draft.color} photo={draft.photo} size="large" /><span>+</span></button>
        <button type="button" onClick={() => photoInput.current?.click()}>Add group photo</button></div>
      <input ref={photoInput} hidden type="file" accept="image/*" onChange={choosePhoto} aria-label="Upload group photo" />
      <form className="group-form" id="create-group" onSubmit={createGroup}>
        <label>GROUP NAME<input required maxLength={70} value={draft.name} onChange={event => updateGroup({ name: event.target.value })} placeholder="Apartment 4B" /></label>
        <label>DESCRIPTION · OPTIONAL<input maxLength={180} value={draft.description} onChange={event => updateGroup({ description: event.target.value })} placeholder="What is this group for?" /></label>
        <div><span className="group-field-label">PURPOSE</span><div className="group-type-picker">{(['General', 'Trip', 'Recurring'] as GroupType[]).map(type =>
          <button type="button" className={draft.type === type ? 'selected' : ''} key={type} onClick={() => updateGroup({ type })}>{type}</button>)}</div>
          <small className="group-type-help">{draft.type === 'General' ? 'General groups support any shared expense and flexible splitting.' :
            draft.type === 'Trip' ? 'Trip groups have dates, a private budget, and future cost planning.' :
              'Add recurring costs with flexible schedules and payment plans for each cycle.'}</small></div>
        {draft.type === 'Trip' && <div className="trip-dates"><span className="group-field-label">TRIP DATES</span>
          <div><label>Start<input type="date" required value={draft.startDate} onChange={event => updateGroup({ startDate: event.target.value })} /></label>
            <label>End<input type="date" required min={draft.startDate} value={draft.endDate} onChange={event => updateGroup({ endDate: event.target.value })} /></label></div></div>}
        <div className="member-preview"><span className="group-field-label">MEMBERS · {selected.length + 1}</span><div className="member-preview-card">
          {groupMembers({ ...draft, members: selected }).slice(0, 4).map(member => <div key={member.id}><Avatar name={member.name} color={member.color} /><small>{member.name.split(' ')[0]}</small></div>)}
          <button type="button" onClick={() => go('select')}>Edit members</button></div></div>
      </form>
      {message && <p className="group-notice" role="status">{message}</p>}
      <button className="group-primary" type="submit" form="create-group">Create group</button>
    </>}
    {screen === 'detail' && active && <>
      <div className="group-detail-header"><button type="button" className="group-back" onClick={() => go('list')} aria-label="Back to Groups">‹</button>
        <Avatar name={active.name} color={active.color} photo={active.photo} /><span><h1>{active.name}</h1><small>{active.type}{active.type === 'Trip' && active.startDate ? ` · ${dateLabel(active.startDate)}–${dateLabel(active.endDate)}` : ''} · {active.members.length + 1} members</small></span>
        <button type="button" className="group-more" onClick={() => { setEditing(true); go('settings'); }} aria-label="Group settings">•••</button></div>
      {active.type === 'Recurring' ? <>
        <p className="detail-description">{active.description || 'Add a description in group settings.'}</p>
        <section className="recurring-calendar"><div><h2>{monthLabel(calendarMonth)}</h2><span>
          <button type="button" aria-label="Previous month" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>‹</button>
          <button type="button" aria-label="Next month" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>›</button></span></div>
          <div className="calendar-days">{cycleEntries.slice(0, 5).map(({ item, date }) => <button type="button" key={`${item.id}-${date}`}
            aria-label={`${item.title} on ${dateLabel(date)}`} onClick={() => openBill(item.id, findCycleIndex(item, date))}>{Number(date.slice(-2))}</button>)}</div>
          <small>{cycleEntries.length} scheduled this month</small></section>
        <div className="group-section-line"><h2 className="group-overline">RECURRING EXPENSES</h2><button type="button" onClick={() => setAddingBill(!addingBill)}>+ Add recurring</button></div>
        {addingBill && <form className="group-form add-bill-form" onSubmit={addBill}>
          <label>Name<input required value={newBill.title} onChange={event => setNewBill({ ...newBill, title: event.target.value })} placeholder="Rent" /></label>
          <label>Amount per cycle<input required type="number" min="0.01" step="0.01" value={newBill.amount} onChange={event => setNewBill({ ...newBill, amount: event.target.value })} /></label>
          <label>Repeat<select value={newBill.frequency} onChange={event => setNewBill({ ...newBill, frequency: event.target.value as Frequency })}>
            {(['Weekly', 'Monthly', 'Quarterly', 'Semi-yearly', 'Yearly', 'Custom'] as Frequency[]).map(value => <option key={value}>{value}</option>)}</select></label>
          {newBill.frequency === 'Custom' && <div className="custom-interval"><label>Every<input required type="number" min="1" step="1" value={newBill.customEvery} onChange={event => setNewBill({ ...newBill, customEvery: event.target.value })} /></label>
            <label>Unit<select value={newBill.customUnit} onChange={event => setNewBill({ ...newBill, customUnit: event.target.value as IntervalUnit })}>
              {(['days', 'weeks', 'months', 'years'] as IntervalUnit[]).map(unit => <option key={unit}>{unit}</option>)}</select></label></div>}
          <label>Recurring from<input required type="date" value={newBill.startDate} onChange={event => setNewBill({ ...newBill, startDate: event.target.value })} /></label>
          <button className="group-primary" type="submit">Save recurring cost</button></form>}
        {active.bills.map(item => <button className="recurring-card" type="button" key={item.id} onClick={() => openBill(item.id)}>
          <span><strong>{item.title}</strong><small>{item.frequency === 'Custom' ? `Every ${item.customEvery} ${item.customUnit}` : item.frequency} · from {dateLabel(item.startDate)}</small><small>Set payer and shares for each cycle</small></span><b>{money(item.amount)}</b></button>)}
        <div className="group-split-actions"><button type="button" onClick={() => setMessage('Split expense pages are coming soon.')}>View balances &amp; confirmations</button>
          <button type="button" onClick={() => setMessage('Split expense pages are coming soon.')}>Split settled expenses</button></div>
        {message && <p className="group-notice" role="status">{message}</p>}
      </> : <>
        <section className="group-hero"><small>{active.type === 'Trip' ? 'YOUR TRIP OVERVIEW' : 'CURRENT RUNNING BALANCE · SAMPLE'}</small>
          <div><span><small>{active.type === 'Trip' ? 'Current total' : 'You owe'}</small><strong>{active.type === 'Trip' ? '$1,450' : '$38.20'}</strong></span>
            <span><small>{active.type === 'Trip' ? 'Your current expenses' : 'Owed to you'}</small><strong>{active.type === 'Trip' ? '$400' : '$64.80'}</strong></span></div></section>
        <div className="group-split-actions"><button type="button" onClick={() => setMessage('Expense entry pages are coming soon.')}>+ Add expense</button>
          <button type="button" onClick={() => setMessage('Split expense pages are coming soon.')}>{active.type === 'Trip' ? 'Split Current Total' : 'Split current expenses'}</button></div>
        {message && <p className="group-notice" role="status">{message}</p>}
        <section className="group-info"><strong>{active.type === 'Trip' ? active.description || 'Trip with friends' : 'Any member can add expenses and split when ready.'}</strong>
          <small>{active.type === 'Trip' ? `Trip dates · ${dateLabel(active.startDate)} – ${dateLabel(active.endDate)}` : `About · ${active.description || 'No description yet'}`}</small></section>
        {active.type === 'Trip' && <>
          <section className="private-budget"><div><h2>Your private trip budget</h2><small>Only you can see this amount</small></div>
            <label className="budget-input">$<input aria-label="Private trip budget" type="number" min="0" step="0.01" placeholder="Set budget"
              value={active.privateBudget ?? ''} onChange={event => setGroups(previous => previous.map(group => group.id === active.id
                ? { ...group, privateBudget: event.target.value === '' ? null : Number(event.target.value) } : group))} /></label></section>
          <div className="group-section-line"><h2 className="group-section-title">Planned expenses</h2><button type="button" onClick={() => go('plan')}>+ Plan expense</button></div>
          {active.plans.length === 0 ? <p className="group-caption">Estimate future costs before adding actual expenses.</p>
            : active.plans.map(item => <div className="group-transaction" key={item.id}><span><strong>{item.title}</strong><small>Estimated · Your share {money(item.amount / (active.members.length + 1))}</small></span><b>{money(item.amount)}</b></div>)}
        </>}
        <h2 className="group-section-title">{active.type === 'Trip' ? 'Current trip expenses' : 'Transactions · Current period'}</h2>
        {(active.type === 'Trip' ? [['Airbnb', 'Nicole paid · Lodging', '+$247.50'], ['Dinner at Myers + Chang', 'You paid · Dining', '−$93.60'], ['Parking', 'Eva paid · Transit', '+$48.00']] :
          [['Electric bill', 'Vivian paid · Utilities', '+$247.50'], ['Weekly groceries', 'Nicole paid · Groceries', '−$93.60'], ['Parking', 'Eva paid · Transit', '+$48.00']]).map(([title, subtitle, amount]) =>
          <div className="group-transaction" key={title}><span><strong>{title}</strong><small>{subtitle}</small></span><b>{amount}</b></div>)}
        <p className="group-caption">Sample transactions · Expense entry and splitting will be implemented separately.</p>
      </>}
    </>}
    {screen === 'plan' && active && <>
      <Header title="Plan a future expense" subtitle={active.name} back={() => go('detail')} />
      <p className="group-info">Estimates are private planning items. They do not change anyone's actual spending or balance.</p>
      <form className="group-form" onSubmit={addPlan}><label>EXPENSE NAME<input required value={plannedTitle} onChange={event => setPlannedTitle(event.target.value)} placeholder="Museum tickets" /></label>
        <label>ESTIMATED TOTAL<input required type="number" min="0.01" step="0.01" value={plannedAmount} onChange={event => setPlannedAmount(event.target.value)} placeholder="0.00" /></label>
        {Number(plannedAmount) > 0 && <div className="planning-impact"><strong>Your estimated share: {money(Number(plannedAmount) / (active.members.length + 1))}</strong>
          <small>{active.privateBudget === null ? 'Set your private trip budget to see the impact.' :
            `${money(active.privateBudget - Number(plannedAmount) / (active.members.length + 1))} of your private trip budget would remain.`}</small></div>}
        <button className="group-primary" type="submit">Save estimate</button></form>
    </>}
    {screen === 'settings' && active && <>
      <Header title="Group settings" back={() => { setEditing(false); go('detail'); }} />
      <div className="group-photo-editor"><button type="button" onClick={() => photoInput.current?.click()} aria-label="Change group photo">
        <Avatar name={active.name} color={active.color} photo={active.photo} size="large" /><span>+</span></button>
        <button type="button" onClick={() => photoInput.current?.click()}>Change group photo</button></div>
      <input ref={photoInput} hidden type="file" accept="image/*" onChange={choosePhoto} aria-label="Upload group photo" />
      <h2 className="group-overline">GROUP DETAILS</h2>
      <div className="group-form settings-fields">
        <label>Group name<input value={active.name} maxLength={70} onChange={event => setGroups(previous => previous.map(group => group.id === active.id ? { ...group, name: event.target.value } : group))} /></label>
        <label>Purpose<select value={active.type} onChange={event => setGroups(previous => previous.map(group => group.id === active.id ? { ...group, type: event.target.value as GroupType } : group))}>
          <option>General</option><option>Trip</option><option>Recurring</option></select></label>
        {active.type === 'Trip' && <div className="trip-dates"><label>Start date<input type="date" value={active.startDate} onChange={event => setGroups(previous => previous.map(group => group.id === active.id ? { ...group, startDate: event.target.value } : group))} /></label>
          <label>End date<input type="date" min={active.startDate} value={active.endDate} onChange={event => setGroups(previous => previous.map(group => group.id === active.id ? { ...group, endDate: event.target.value } : group))} /></label></div>}
        <label>DESCRIPTION · VISIBLE TO MEMBERS<textarea value={active.description} maxLength={180} onChange={event => setGroups(previous => previous.map(group => group.id === active.id ? { ...group, description: event.target.value } : group))} /></label>
      </div>
      <div className="group-section-line"><h2 className="group-overline">MEMBERS · {active.members.length + 1}</h2><button type="button" onClick={() => { setSelected([]); go('add-members'); }}>+ Add people</button></div>
      {groupMembers(active).map(member => <div className="member-row" key={member.id}><Avatar name={member.name} color={member.color} /><span><strong>{member.id === 'you' ? 'You' : member.name}</strong><small>{member.id === 'you' ? 'Owner · You' : 'Member'}</small></span></div>)}
      <p className="group-info"><strong>New members start from $0</strong><small>Previous expenses and balances are not assigned to them.</small></p>
      <button className="group-delete-button" type="button" onClick={() => setPendingDelete(active)}>Delete group</button>
      {message && <p className="group-notice" role="status">{message}</p>}
    </>}
    {screen === 'add-members' && active && <>
      <header className="group-centered-header"><button type="button" onClick={() => go('settings')}>Cancel</button><h1>Add people</h1></header>
      <label className="group-search"><span aria-hidden="true">⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search your friends" aria-label="Search your friends" /></label>
      <p className="group-info"><strong>New members start from $0</strong><small>They join the next expense period. Previous transactions and balances remain with existing members.</small></p>
      <h2 className="group-overline">FRIENDS</h2>
      {listFriends.filter(friend => !active.members.includes(friend.id)).map(friend => <button className="friend-card select-friend" type="button" key={friend.id} onClick={() => toggle(friend.id)}>
        <Avatar name={friend.name} color={friend.color} /><span><strong>{friend.name}</strong><small>{friend.handle}</small></span>
        <span className={selected.includes(friend.id) ? 'selection checked' : 'selection'}>{selected.includes(friend.id) ? '✓' : ''}</span></button>)}
      <div className="group-bottom-action"><p>{selected.length} {selected.length === 1 ? 'person' : 'people'} selected</p>
        <button className="group-primary" type="button" disabled={!selected.length} onClick={() => {
          setGroups(previous => previous.map(group => group.id === active.id ? { ...group, members: [...group.members, ...selected] } : group)); go('settings');
        }}>Add selected {selected.length === 1 ? 'person' : 'people'}</button>
        <small>Invitations and notifications require backend integration.</small></div>
    </>}
    {screen === 'bill' && active && bill && <>
      <Header title={bill.title} subtitle={active.name} back={() => go('detail')} />
      <section className="group-hero"><small>AMOUNT PER CYCLE</small><strong>{money(bill.amount)}</strong><p>{bill.frequency === 'Custom' ? `Every ${bill.customEvery} ${bill.customUnit}` : bill.frequency} · starts {dateLabel(bill.startDate)}</p></section>
      <div className="cycle-navigation"><button type="button" disabled={cycleIndex === 0} onClick={() => { setCycleIndex(cycleIndex - 1); setAllocationDraft(null); setMessage(''); }} aria-label="Previous cycle">‹</button>
        <span>Cycle of {dateLabel(cycleDate)}</span><button type="button" onClick={() => { setCycleIndex(cycleIndex + 1); setAllocationDraft(null); setMessage(''); }} aria-label="Next cycle">›</button></div>
      <h2 className="group-overline">PAYMENT PLAN FOR THIS CYCLE</h2>
      <form className="group-form cycle-form" onSubmit={saveAllocation}>
        <label>Who pays this cycle?<select value={(allocationDraft ?? allocation)?.payerId} onChange={event => setAllocationDraft({ ...(allocationDraft ?? allocation!), payerId: event.target.value })}>
          {members.map(member => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label>
        <span className="group-field-label">HOW MUCH EACH MEMBER PAYS</span>
        {members.map(member => <label key={member.id}>{member.name}<input type="number" min="0" step="0.01" required
          value={((allocationDraft ?? allocation)?.shares[member.id] ?? 0) / 100}
          onChange={event => setAllocationDraft({ ...(allocationDraft ?? allocation!), shares: { ...(allocationDraft ?? allocation)!.shares, [member.id]: Math.round(Number(event.target.value) * 100) } })} /></label>)}
        <button className="group-primary" type="submit">Save this cycle</button></form>
      {message && <p className="group-notice" role="status">{message}</p>}
      <p className="group-info"><small>Payment and reimbursement confirmations will be part of the expense and settlement implementation.</small></p>
    </>}
    {pendingDelete && <div className="group-dialog-backdrop"><div className="group-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-group-title" aria-describedby="delete-group-description" onKeyDown={event => { if (event.key === 'Escape') setPendingDelete(null); }}>
      <h2 id="delete-group-title">Delete {pendingDelete.name}?</h2>
      <p id="delete-group-description">This removes the group and its preview data for this session.</p>
      <div><button type="button" autoFocus onClick={() => setPendingDelete(null)}>Cancel</button>
        <button type="button" onClick={confirmDelete}>Confirm delete</button></div>
    </div></div>}
  </main>;
}
