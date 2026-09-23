import { useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import './groups.css';

type GroupType = 'General' | 'Trip' | 'Recurring';
type Friend = { id: string; name: string; handle: string; color: string };
type PlannedExpense = { id: number; title: string; amount: number };
type RecurringBill = { id: number; title: string; amount: number; dueDay: number; payer: string; nextPayer: string };
type Group = {
  id: number; name: string; description: string; type: GroupType; members: string[];
  color: string; photo: string | null; startDate: string; endDate: string;
  privateBudget: number | null; plans: PlannedExpense[]; bills: RecurringBill[];
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
    bills: [{ id: 1, title: 'Rent', amount: 1800, dueDay: 1, payer: 'Vivian', nextPayer: 'Nicole' },
      { id: 2, title: 'Internet', amount: 75, dueDay: 15, payer: 'Vivian', nextPayer: 'Nicole' }] },
];

const money = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
const dateLabel = (value: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
const monthLabel = (value: Date) => value.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
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
  const [newBill, setNewBill] = useState({ title: '', amount: '', dueDay: '1', payer: 'Vivian', nextPayer: 'Nicole' });
  const [addingBill, setAddingBill] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const active = groups.find(group => group.id === activeId);
  const bill = active?.bills.find(item => item.id === billId);

  const go = (next: Screen) => { setScreen(next); setQuery(''); setMessage(''); onRootChange(next === 'list'); };
  const updateGroup = (patch: Partial<Group>) => {
    if (editing && activeId !== null) setGroups(previous => previous.map(group => group.id === activeId ? { ...group, ...patch } : group));
    else setDraft(previous => ({ ...previous, ...patch }));
  };
  const current = editing && active ? active : draft;
  const enterGroup = (id: number) => { setActiveId(id); setEditing(false); go('detail'); };
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
  const groupMembers = (group: Group) => [{ id: 'you', name: 'You', handle: '@you', color: 'green' }, ...group.members.map(id => friends.find(friend => friend.id === id)).filter((friend): friend is Friend => Boolean(friend))];
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
    if (!active || Number(newBill.amount) <= 0) return;
    const item: RecurringBill = { id: Date.now(), title: newBill.title.trim(), amount: Number(newBill.amount),
      dueDay: Number(newBill.dueDay), payer: newBill.payer, nextPayer: newBill.nextPayer };
    setGroups(previous => previous.map(group => group.id === active.id ? { ...group, bills: [...group.bills, item] } : group));
    setAddingBill(false); setNewBill({ title: '', amount: '', dueDay: '1', payer: 'Vivian', nextPayer: 'Nicole' });
  };

  return <main className="groups-workspace">
    {screen === 'list' && <>
      <Header title="Groups" subtitle="Split, plan, and settle with people you trust" />
      <label className="group-search"><span aria-hidden="true">⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search groups" aria-label="Search groups" /></label>
      <div className="group-actions"><button type="button" onClick={() => go('friends')}>+&nbsp; Find friends</button><button type="button" onClick={startCreate}>+&nbsp; New group</button></div>
      <section className="group-balance"><small>Across all groups · Sample data</small><div><strong>$64.80 owed to you</strong><strong>$38.20 you owe</strong></div></section>
      <h2 className="group-section-title">Your groups</h2>
      <div className="group-list">{groups.filter(group => group.name.toLowerCase().includes(query.toLowerCase())).map(group =>
        <button className="group-list-card" type="button" key={group.id} onClick={() => enterGroup(group.id)}>
          <Avatar name={group.name} color={group.color} photo={group.photo} />
          <span><strong>{group.name}</strong><small>{group.members.length + 1} members · {group.type}</small><em>{group.description}</em></span><b aria-hidden="true">›</b>
        </button>)}</div>
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
              'Add recurring costs with schedules and payer rotation.'}</small></div>
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
          <div className="calendar-days">{active.bills.slice(0, 5).map(item => <button type="button" key={item.id}
            onClick={() => { setBillId(item.id); go('bill'); }}>{item.dueDay}</button>)}</div>
          <small>{active.bills.length} scheduled this month</small></section>
        <div className="group-section-line"><h2 className="group-overline">RECURRING EXPENSES</h2><button type="button" onClick={() => setAddingBill(!addingBill)}>+ Add recurring</button></div>
        {addingBill && <form className="group-form add-bill-form" onSubmit={addBill}>
          <label>Name<input required value={newBill.title} onChange={event => setNewBill({ ...newBill, title: event.target.value })} placeholder="Rent" /></label>
          <label>Monthly amount<input required type="number" min="0.01" step="0.01" value={newBill.amount} onChange={event => setNewBill({ ...newBill, amount: event.target.value })} /></label>
          <label>Due day<input required type="number" min="1" max="28" value={newBill.dueDay} onChange={event => setNewBill({ ...newBill, dueDay: event.target.value })} /></label>
          <label>Current payer<select value={newBill.payer} onChange={event => setNewBill({ ...newBill, payer: event.target.value })}>{['Vivian', ...active.members.map(id => friends.find(friend => friend.id === id)?.name.split(' ')[0] || '')].map(name => <option key={name}>{name}</option>)}</select></label>
          <label>Next payer<select value={newBill.nextPayer} onChange={event => setNewBill({ ...newBill, nextPayer: event.target.value })}>{['Vivian', ...active.members.map(id => friends.find(friend => friend.id === id)?.name.split(' ')[0] || '')].map(name => <option key={name}>{name}</option>)}</select></label>
          <button className="group-primary" type="submit">Save recurring cost</button></form>}
        {active.bills.map(item => <button className="recurring-card" type="button" key={item.id} onClick={() => { setBillId(item.id); go('bill'); }}>
          <span><strong>{item.title}</strong><small>Monthly · due day {item.dueDay}</small><small>{item.payer} pays · Next: {item.nextPayer}</small></span><b>{money(item.amount)}</b></button>)}
        {active.bills.length > 0 && <p className="group-info">Next payer rotation: {active.bills[0].nextPayer} pays {active.bills[0].title} next month.</p>}
      </> : <>
        <section className="group-hero"><small>{active.type === 'Trip' ? 'YOUR TRIP OVERVIEW' : 'CURRENT RUNNING BALANCE · SAMPLE'}</small>
          <div><span><small>{active.type === 'Trip' ? 'Current total' : 'You owe'}</small><strong>{active.type === 'Trip' ? '$1,450' : '$38.20'}</strong></span>
            <span><small>{active.type === 'Trip' ? 'Your current expenses' : 'Owed to you'}</small><strong>{active.type === 'Trip' ? '$400' : '$64.80'}</strong></span></div></section>
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
      <section className="group-hero"><small>NEXT PAYMENT</small><strong>{money(bill.amount)}</strong><p>Due day {bill.dueDay} · Monthly</p></section>
      <p className="group-info"><small>Payer rotation</small><strong>{bill.payer} pays this month</strong><small>Next: {bill.nextPayer} · following month</small></p>
      <h2 className="group-overline">MEMBER SHARES · PLANNED</h2>
      {groupMembers(active).map(member => <div className="member-row" key={member.id}><Avatar name={member.name} color={member.color} />
        <span><strong>{member.name}</strong><small>Estimated share</small></span><b>{money(bill.amount / (active.members.length + 1))}</b></div>)}
      <p className="group-info"><small>Payment and reimbursement confirmations will be part of the expense and settlement implementation.</small></p>
    </>}
  </main>;
}
