import { updatePayment, type PaymentAction } from '../expenses/payments';
import ExpenseDetails from '../expenses/ExpenseDetails';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import './groups.css';
import Avatar from '../../components/common/Avatar';
import { ApiError } from '../../api/client';
import { friendsApi } from '../../api/friends.api';
import type { FriendUser } from '../../api/types';
import { usersApi } from '../../api/users.api';
import { formatCents, type PreviewSplit } from '../expenses/split';
import SplitSaved from '../expenses/SplitSaved';
import ExpenseEntry from '../expenses/ExpenseEntry';
import RunningTotalSplit from './RunningTotalSplit';

type GroupType = 'General' | 'Trip' | 'Recurring';
type Friend = FriendUser & { handle: string; color: string };
type Member = { id: string; name: string; handle: string; color: string };
type PlannedExpense = { id: number; title: string; amount: number };
type Frequency = 'Weekly' | 'Monthly' | 'Quarterly' | 'Semi-yearly' | 'Yearly' | 'Custom';
type IntervalUnit = 'days' | 'weeks' | 'months' | 'years';
type Allocation = { payerId: string; shares: Record<string, number> };
type RecurringBill = { id: number; title: string; amount: number; startDate: string; frequency: Frequency;
  customEvery: number; customUnit: IntervalUnit; cycles: Record<string, Allocation> };
type Group = {
  id: number; name: string; description: string; type: GroupType; members: string[];
  color: string; photo: string | null; startDate: string; endDate: string;
  balance: number; privateBudget: number | null; plans: PlannedExpense[]; bills: RecurringBill[]; archived?: boolean;
};
export type FriendFixture = Friend;
export type GroupFixture = Group;
type Screen = 'friend-profile' | 'edit-expense' | 'expense-details' | 'saved' | 'expense' | 'running-split' | 'list' | 'friends' | 'select' | 'customize' | 'detail' | 'settings' | 'add-members' | 'bill' | 'plan';

const initialGroups: Group[] = [];

const money = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
const balanceMoney = (amount: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(amount);
const splitBalanceDelta = (split: PreviewSplit) => {
  const yourShare = split.shares.find(share => share.memberId === 'you')?.totalCents ?? 0;
  const deltaCents = split.payerId === 'you' ? split.totalCents - yourShare : -yourShare;
  return deltaCents / 100;
};
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
const defaultAllocation = (bill: RecurringBill, members: Member[]): Allocation => {
  const cents = Math.round(bill.amount * 100);
  const each = Math.floor(cents / members.length);
  return { payerId: 'you', shares: Object.fromEntries(members.map((member, index) => [member.id, each + (index < cents % members.length ? 1 : 0)])) };
};
const initialDraft = (): Group => ({ id: 0, name: '', description: '', type: 'General', members: [], color: 'gold',
  photo: null, startDate: '', endDate: '', balance: 0, privateBudget: null, plans: [], bills: [] });


function Header({ title, subtitle, back, trailing }: { title: string; subtitle?: string; back?: () => void; trailing?: ReactNode }) {
  return <header className="group-header">
    {back && <button className="group-back" type="button" onClick={back} aria-label="Back">‹</button>}
    <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{trailing}
  </header>;
}

export default function GroupsWorkspace({ onRootChange, initialGroupsData, initialFriendsData }: {
  onRootChange: (atRoot: boolean) => void;
  initialGroupsData?: GroupFixture[];
  initialFriendsData?: FriendFixture[];
}) {
  const [viewedExpense, setViewedExpense] = useState<{ title: string; subtitle: string; amount: string; split?: PreviewSplit } | null>(null);
  const [savedSplit, setSavedSplit] = useState<PreviewSplit | null>(null);
  const [previewSplits, setPreviewSplits] = useState<Record<number, PreviewSplit[]>>({});
  const [screen, setScreen] = useState<Screen>('list');
  const [groups, setGroups] = useState<Group[]>(initialGroupsData ?? initialGroups);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Group>(initialDraft);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [friends, setFriends] = useState<Friend[]>(initialFriendsData ?? []);
  const [searchResults, setSearchResults] = useState<Friend[]>([]);
  const [activeFriend, setActiveFriend] = useState<Friend | null>(null);
  const [peopleLoading, setPeopleLoading] = useState(false);
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
  const groupMembers = (group: Group): Member[] => [{ id: 'you', name: 'You', handle: '@you', color: 'green' }, ...group.members.map(id => friends.find(friend => friend.id === id)).filter((friend): friend is Friend => Boolean(friend))];
  const active = groups.find(group => group.id === activeId);
  const bill = active?.bills.find(item => item.id === billId);
  const cycleDate = bill ? isoDate(occurrence(bill, cycleIndex)) : '';
  const members = active ? groupMembers(active) : [];
  const allocation = bill ? bill.cycles[cycleDate] ?? defaultAllocation(bill, members) : null;
  const cycleEntries = active?.bills.flatMap(item => occurrencesInMonth(item, calendarMonth).map(date => ({ item, date }))) ?? [];
  const balanceGroups = groups.filter(group => !group.archived);
  const owedToYou = balanceGroups.reduce((total, group) => total + Math.max(group.balance, 0), 0);
  const youOwe = balanceGroups.reduce((total, group) => total + Math.max(-group.balance, 0), 0);
  const largestBalance = Math.max(owedToYou, youOwe, 1);
  const balanceWidth = (amount: number) => `${Math.round((amount / largestBalance) * 100)}%`;
  const activeSplits = active ? previewSplits[active.id] ?? [] : [];
  const recordedRunningTotal = activeSplits.reduce((total, split) => total + split.totalCents, 0);
  const currentRunningTotal = active ? recordedRunningTotal : 0;
  const runningActivityWeights = Object.fromEntries(members.map(member => [member.id,
    activeSplits.reduce((total, split) => total + (split.shares.find(share => share.memberId === member.id)?.totalCents ?? 0), 0)]));
  const yourCurrentExpenses = activeSplits.length ? runningActivityWeights.you ?? 0 : 0;

  const toFriend = (user: FriendUser): Friend => ({ ...user, handle: `@${user.username}`, color: ['mint', 'peach', 'blue', 'sand'][user.username.length % 4]! });
  const refreshFriends = () => friendsApi.list().then(result => setFriends(result.friends.map(toFriend))).catch(error => setMessage(error instanceof ApiError ? error.message : 'Could not load friends.'));
  useEffect(() => { if (!initialFriendsData) void refreshFriends(); }, [initialFriendsData]);
  useEffect(() => {
    if (screen !== 'friends') return;
    setPeopleLoading(true);
    const timeout = window.setTimeout(() => {
      usersApi.search(query).then(result => setSearchResults(result.users.map(toFriend))).catch(error => setMessage(error instanceof ApiError ? error.message : 'Could not search users.')).finally(() => setPeopleLoading(false));
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [screen, query]);

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
    setPreviewSplits(previous => { const next = { ...previous }; delete next[deleted.id]; return next; });
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
  const startCreate = () => { setDraft(initialDraft()); setSelected([]); setEditing(false); go('select'); };
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
  const listFriends = friends.filter(friend => `${friend.name} ${friend.handle} ${friend.email} ${friend.phone ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  const addFriend = async (friend: Friend) => {
    try {
      const result = await friendsApi.add(friend.id);
      const added = toFriend(result.friend);
      setFriends(previous => previous.some(item => item.id === added.id) ? previous : [...previous, added]);
      setSearchResults(previous => previous.map(item => item.id === added.id ? { ...item, isFriend: true } : item));
      setActiveFriend(previous => previous?.id === added.id ? { ...previous, isFriend: true } : previous);
    } catch (error) { setMessage(error instanceof ApiError ? error.message : 'Could not add this friend.'); }
  };
  const removeFriend = async (friend: Friend) => {
    try {
      await friendsApi.remove(friend.id);
      setFriends(previous => previous.filter(item => item.id !== friend.id));
      setSearchResults(previous => previous.map(item => item.id === friend.id ? { ...item, isFriend: false } : item));
      setActiveFriend(previous => previous?.id === friend.id ? { ...previous, isFriend: false } : previous);
    } catch (error) { setMessage(error instanceof ApiError ? error.message : 'Could not remove this friend.'); }
  };
  const openFriend = async (friend: Friend) => {
    setActiveFriend(friend); go('friend-profile');
    try { setActiveFriend(toFriend((await usersApi.get(friend.id)).user)); }
    catch (error) { setMessage(error instanceof ApiError ? error.message : 'Could not load this profile.'); }
  };
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

  if (screen === 'running-split' && active) return <RunningTotalSplit groupName={active.name} totalCents={currentRunningTotal}
    members={members} activityWeights={runningActivityWeights} onBack={() => go('detail')} onDone={() => {
      go('detail'); setMessage('Current total split saved in this preview session.');
    }} />;

  if (screen === 'expense' && active) return <ExpenseEntry groupName={active.name} members={members} onBack={() => go('detail')} onConfirm={split => {
    setPreviewSplits(previous => ({ ...previous, [active.id]: [...(previous[active.id] ?? []), split] }));
    setGroups(previous => previous.map(group => group.id === active.id
      ? { ...group, balance: group.balance + splitBalanceDelta(split) } : group));
    setSavedSplit(split); go('saved');
  }} />;

  if (screen === 'saved' && savedSplit && active) return <SplitSaved split={savedSplit} members={members} onBack={() => {
    go('detail'); setMessage('Expense added and group balances updated for this preview session. Reloading clears the preview.');
  }} />;

  if (screen === 'edit-expense' && active && viewedExpense?.split) return <ExpenseEntry initialSplit={viewedExpense.split} groupName={active.name} members={members} onBack={() => go('expense-details')} onConfirm={split => {
    const balanceChange = splitBalanceDelta(split) - splitBalanceDelta(viewedExpense.split!);
    setPreviewSplits(previous => ({ ...previous, [active.id]: (previous[active.id] ?? []).map(expense => expense === viewedExpense.split ? split : expense) }));
    setGroups(previous => previous.map(group => group.id === active.id
      ? { ...group, balance: group.balance + balanceChange } : group));
    setViewedExpense({ title: split.name, subtitle: `${members.find(member => member.id === split.payerId)?.name ?? 'Member'} paid`, amount: formatCents(split.totalCents), split });
    go('expense-details');
  }} />;

  if (screen === 'expense-details' && active && viewedExpense) return <ExpenseDetails onPaymentViewChange={onRootChange} onPaymentAction={(memberId: string, action: PaymentAction) => {
    if (!viewedExpense.split) return;
    const split = updatePayment(viewedExpense.split, 'you', memberId, action);
    setPreviewSplits(previous => ({ ...previous, [active.id]: (previous[active.id] ?? []).map(expense => expense === viewedExpense.split ? split : expense) }));
    setViewedExpense({ ...viewedExpense, split });
  }} onEdit={() => go('edit-expense')} expense={viewedExpense} groupName={active.name} members={members} onBack={() => go('detail')} />;

  return <main className="groups-workspace">
    {screen === 'list' && <>
      <Header title="Groups" subtitle="Split, plan, and settle with people you trust" />
      <label className="group-search"><span aria-hidden="true">⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search groups" aria-label="Search groups" /></label>
      <div className="group-actions"><button type="button" onClick={() => go('friends')}>+&nbsp; Find friends</button><button type="button" onClick={startCreate}>+&nbsp; New group</button></div>
      <section className="group-balance" aria-label="Balance overview">
        <small>Across all groups</small>
        <div className="group-balance-row is-owed">
          <span>Owed to you</span><span className="group-balance-track" aria-hidden="true"><span style={{ width: balanceWidth(owedToYou) }} /></span>
          <strong>{balanceMoney(owedToYou)}</strong>
        </div>
        <div className="group-balance-row is-owing">
          <span>You owe</span><span className="group-balance-track" aria-hidden="true"><span style={{ width: balanceWidth(youOwe) }} /></span>
          <strong>{balanceMoney(youOwe)}</strong>
        </div>
      </section>
      <h2 className="group-section-title">Your groups</h2>
      {message && <p className="group-notice" role="status">{message}</p>}
      <div className="group-list">{groups.filter(group => !group.archived && group.name.toLowerCase().includes(query.toLowerCase())).map(group =>
        <div className={`group-list-row${openActionsId === group.id ? ' is-open' : ''}`} key={group.id} role="group" aria-label={group.name}
          onPointerDown={event => { if (event.target instanceof Element && event.target.closest('.group-list-card')) swipeStart.current = { id: group.id, x: event.clientX, y: event.clientY }; }}
          onPointerMove={event => { const start = swipeStart.current; if (start?.id === group.id && Math.abs(event.clientX - start.x) > 12 && Math.abs(event.clientX - start.x) > Math.abs(event.clientY - start.y)) event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerUp={event => finishSwipe(group.id, event.clientX, event.clientY)} onPointerCancel={() => { swipeStart.current = null; }}>
          <div className="group-card-actions"><button type="button" onClick={() => archiveGroup(group)}>Archive</button>
            <button type="button" onClick={() => { setPendingDelete(group); setOpenActionsId(null); }}>Delete</button></div>
          <div className="group-card-foreground"><button className="group-list-card" type="button" onClick={() => {
            if (suppressCardClick.current === group.id) { suppressCardClick.current = null; return; }
            if (openActionsId === group.id) { setOpenActionsId(null); return; }
            enterGroup(group.id);
          }}><Avatar name={group.name} color={group.color} photo={group.photo}
              balanceDirection={group.balance > 0 ? 'owed' : group.balance < 0 ? 'owing' : undefined} />
              <span><strong>{group.name}</strong><small>{group.members.length + 1} members · {group.type}</small>
                <em className={group.balance < 0 ? 'is-owing' : group.balance > 0 ? 'is-owed' : undefined}>
                  {group.balance < 0 ? `You owe ${balanceMoney(Math.abs(group.balance))}`
                    : group.balance > 0 ? `You are owed ${balanceMoney(group.balance)}` : group.description}
                </em></span></button>
            <button className="group-card-menu" type="button" aria-label="Group actions" aria-expanded={openActionsId === group.id}
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
      <h2 className="group-overline">{query ? 'SEARCH RESULTS' : `ALL PEOPLE · FRIENDS FIRST`}</h2>
      {peopleLoading && <p className="group-caption" role="status">Searching accounts…</p>}
      {!peopleLoading && searchResults.length === 0 && <p className="group-caption">No matching accounts found.</p>}
      {searchResults.map(friend => <div className="friend-card" key={friend.id}>
        <button type="button" className="friend-profile-link" onClick={() => void openFriend(friend)}>
          <Avatar name={friend.name} color={friend.color} photo={friend.photoUrl} /><span><strong>{friend.name}</strong><small>{friend.handle} · {friend.email}</small></span>
        </button>
        {friend.isFriend ? <span className="friend-status">Friends</span> : <button type="button" onClick={() => void addFriend(friend)}>Add</button>}
      </div>)}
      {message && <p className="group-notice" role="status">{message}</p>}
    </>}
    {screen === 'friend-profile' && activeFriend && <>
      <Header title="Friend profile" back={() => go('friends')} />
      <section className="friend-detail-card">
        <Avatar name={activeFriend.name} color={activeFriend.color} photo={activeFriend.photoUrl} size="large" />
        <h2>{activeFriend.name}</h2><strong>@{activeFriend.username}</strong>
        {activeFriend.bio && <p>{activeFriend.bio}</p>}
        <dl><div><dt>Email</dt><dd>{activeFriend.email}</dd></div><div><dt>Phone</dt><dd>{activeFriend.phone ?? 'Not provided'}</dd></div></dl>
        {activeFriend.isFriend ? <button className="group-secondary" type="button" onClick={() => void removeFriend(activeFriend)}>Remove friend</button>
          : <button className="group-primary" type="button" onClick={() => void addFriend(activeFriend)}>Add friend</button>}
      </section>
      <h2 className="group-overline">GROUPS YOU SHARE</h2>
      {activeFriend.sharedGroups?.length ? activeFriend.sharedGroups.map(group => <div className="group-info" key={group.id}><strong>{group.name}</strong></div>)
        : <p className="group-caption">No shared groups yet.</p>}
      {message && <p className="group-notice" role="status">{message}</p>}
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
        <label>GROUP NAME<input required maxLength={70} value={draft.name} onChange={event => updateGroup({ name: event.target.value })} placeholder="Group name" /></label>
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
        <section className="group-hero"><small>{active.type === 'Trip' ? 'YOUR TRIP OVERVIEW' : 'CURRENT RUNNING BALANCE'}</small>
          <div><span><small>{active.type === 'Trip' ? 'Current total' : 'You owe'}</small><strong>{active.type === 'Trip' ? formatCents(currentRunningTotal) : balanceMoney(Math.max(-active.balance, 0))}</strong></span>
            <span><small>{active.type === 'Trip' ? 'Your current expenses' : 'Owed to you'}</small><strong>{active.type === 'Trip' ? formatCents(yourCurrentExpenses) : balanceMoney(Math.max(active.balance, 0))}</strong></span></div></section>
        <div className="group-split-actions"><button type="button" onClick={() => go('expense')}>+ Add expense</button>
          <button type="button" disabled={!currentRunningTotal} title={!currentRunningTotal ? 'Add an expense before splitting the current total' : undefined}
            onClick={() => go('running-split')}>{active.type === 'Trip' ? 'Split Current Total' : 'Split current expenses'}</button></div>
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
        <section aria-label={active.type === 'Trip' ? 'Current trip expenses' : 'Transactions · Current period'}>
        <h2 className="group-section-title">{active.type === 'Trip' ? 'Current trip expenses' : 'Transactions · Current period'}</h2>
        {[...(previewSplits[active.id] ?? [])].reverse().map((split, index) => {
          const title = split.name;
          const subtitle = `${members.find(member => member.id === split.payerId)?.name ?? 'Member'} paid · ${split.mode === 'equal' ? 'Equal split' : 'Split by item'} · Preview`;
          const amount = formatCents(split.totalCents);
          return <button type="button" className="group-transaction expense-list-row" key={index} onClick={() => { setViewedExpense({ title, subtitle, amount, split }); go('expense-details'); }}>
            <span><strong>{title}</strong><small>{subtitle}</small></span><b>{amount}<span aria-hidden="true">›</span></b>
          </button>;
        })}
        <p className="group-caption">New expenses update this group's running total for the current session.</p>
        </section>
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
