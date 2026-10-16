import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Avatar from '../../components/common/Avatar';
import { budgetsApi, type ApiGroupBudget, type ApiPersonalBudget } from '../../api/budgets.api';
import { ApiError } from '../../api/client';
import { relativeTime } from '../../utils/dates';
import { formatCents } from '../expenses/split';
import { type CategoryKey, budgetPeriod, categoryPct, isOverLimit, toCategoryBudgets, toCategoryTransactions, totalPlannedCents, totalSpentCents } from './categoryPlan';
import { groupBudgetPct, settleUpBody, toGroupBudget, totalOwedCents } from './groupBudgetPlan';
import { CategoryTransactions, EditGroupPlan, EditLimits, SpendingInsights, WhoOwesWhat } from './CategoryBudgetDetails';
import './categoryBudgets.css';

type BudgetScope = 'personal' | 'group';
type Detail = { kind: 'insights' } | { kind: 'category'; key: CategoryKey; from: 'budget' | 'insights' } | { kind: 'owes' } | { kind: 'limits' } | { kind: 'groupPlan' } | null;

const REFRESH_MS = 15_000;
const errorMessage = (error: unknown) => error instanceof ApiError ? error.message : 'Unable to reach the server. Try again.';

// `active` is false while the tab is hidden: nothing is fetched or polled until the user opens the budget.
export default function CategoryBudgets({ onOpenSimulator, active = true }: { onOpenSimulator: () => void; active?: boolean }) {
  const [scope, setScope] = useState<BudgetScope>('personal');
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail>(null);
  const [personal, setPersonal] = useState<ApiPersonalBudget | null>(null);
  const [groups, setGroups] = useState<ApiGroupBudget[] | null>(null);
  const [personalError, setPersonalError] = useState('');
  const [groupsError, setGroupsError] = useState('');
  // Only the most recent request may update state, so a slow refresh cannot overwrite a newer save.
  const latest = useRef({ personal: 0, groups: 0 });

  const loadPersonal = useCallback(async () => {
    const id = ++latest.current.personal;
    try { const data = await budgetsApi.personal(); if (id === latest.current.personal) { setPersonal(data); setPersonalError(''); } }
    catch (error) { if (id === latest.current.personal) setPersonalError(errorMessage(error)); }
  }, []);
  const loadGroups = useCallback(async () => {
    const id = ++latest.current.groups;
    try { const data = await budgetsApi.groups(); if (id === latest.current.groups) { setGroups(data.groups); setGroupsError(''); } }
    catch (error) { if (id === latest.current.groups) setGroupsError(errorMessage(error)); }
  }, []);
  const refresh = useCallback(() => { void loadPersonal(); void loadGroups(); }, [loadPersonal, loadGroups]);

  useEffect(() => {
    if (!active) return;
    refresh();
    const interval = window.setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [active, refresh]);

  const budgets = useMemo(() => personal ? toCategoryBudgets(personal.categories) : [], [personal]);
  const period = personal ? budgetPeriod(personal) : null;
  const spent = totalSpentCents(budgets);
  const planned = totalPlannedCents(budgets);
  const pct = planned ? Math.min(100, Math.max(0, (spent / planned) * 100)) : 0;
  const overLimit = budgets.filter(isOverLimit);

  const groupBudgets = useMemo(() => (groups ?? []).map(toGroupBudget), [groups]);
  const activeGroup = groupBudgets.find(group => group.id === activeGroupId) ?? groupBudgets[0];
  const groupPct = activeGroup ? groupBudgetPct(activeGroup) : 0;
  const remainingOwed = activeGroup ? totalOwedCents(activeGroup) : 0;

  const saveLimits = async (limits: Record<CategoryKey, number>) => {
    const data = await budgetsApi.saveLimits(limits);
    latest.current.personal++;
    setPersonal(data); setPersonalError('');
    setDetail(null);
  };
  const saveGroupPlan = async (groupId: string, plannedCents: number) => {
    const data = await budgetsApi.saveGroupPlan(groupId, plannedCents);
    latest.current.groups++;
    setGroups(data.groups); setGroupsError('');
    setDetail(null);
  };

  if (detail) {
    const item = detail.kind === 'category' ? budgets.find(c => c.key === detail.key) : undefined;
    const showGroup = (detail.kind === 'owes' || detail.kind === 'groupPlan') ? activeGroup : undefined;
    return <main className="cb-screen">
      {detail.kind === 'insights' && period && <SpendingInsights budgets={budgets} period={period} onBack={() => setDetail(null)} onSelectCategory={key => setDetail({ kind: 'category', key, from: 'insights' })} />}
      {item && period && personal && detail.kind === 'category' && <CategoryTransactions item={item} period={period} transactions={toCategoryTransactions(personal.transactions[item.key])}
        onBack={() => setDetail(detail.from === 'insights' ? { kind: 'insights' } : null)} />}
      {detail.kind === 'limits' && personal && <EditLimits budgets={budgets} onCancel={() => setDetail(null)} onSave={saveLimits} />}
      {detail.kind === 'owes' && showGroup && <WhoOwesWhat group={showGroup} onBack={() => setDetail(null)} />}
      {detail.kind === 'groupPlan' && showGroup && <EditGroupPlan group={showGroup} onCancel={() => setDetail(null)} onSave={plannedCents => saveGroupPlan(showGroup.id, plannedCents)} />}
    </main>;
  }

  const retry = (message: string) => <div className="cb-notice cb-warn" role="alert">
    <p>{message}</p><button type="button" className="cb-retry" onClick={refresh}>Retry</button>
  </div>;

  return <main className="cb-screen">
    <header className="cb-header">
      {scope === 'group' ? <>
        <h1>{activeGroup?.name ?? 'Group budget'}</h1>
        <p>{activeGroup?.memberInfo ?? 'Shared spending with your groups'}</p>
      </> : <>
        <div className="cb-heading-row"><h1>Personal budget</h1>
          <button type="button" className="cb-simulator-link" aria-label="Open what-if simulator" onClick={onOpenSimulator}>What-if ›</button></div>
        <p>Budgets, bank sync, and spending insights</p>
      </>}
    </header>

    <div className="cb-toggle" role="tablist" aria-label="Budget scope">
      <button type="button" role="tab" aria-selected={scope === 'personal'} className={scope === 'personal' ? 'active' : ''} onClick={() => setScope('personal')}>Personal</button>
      <button type="button" role="tab" aria-selected={scope === 'group'} className={scope === 'group' ? 'active' : ''} onClick={() => setScope('group')}>Group</button>
    </div>

    {scope === 'group' ? (!groups ? (groupsError ? retry(groupsError) : <p className="cb-notice" role="status">Loading your groups…</p>)
      : !activeGroup ? <p className="cb-notice" role="status">You're not in any active groups yet. Create one from the Groups tab.</p> : <>
      <div className="cb-group-picker" role="tablist" aria-label="Select group">
        {groupBudgets.map(group => <button key={group.id} type="button" role="tab" aria-selected={group.id === activeGroup.id}
          className={group.id === activeGroup.id ? 'active' : ''} onClick={() => setActiveGroupId(group.id)}>
          <Avatar name={group.name} color={group.color} />
          {group.name}
        </button>)}
      </div>

      <section className="cb-hero" aria-label="Group budget summary">
        <strong className="cb-hero-amount">{formatCents(activeGroup.spentCents)} spent</strong>
        <p className="cb-hero-sub">{activeGroup.plannedCents ? `of ${formatCents(activeGroup.plannedCents)} shared plan` : 'No shared plan set'} · {activeGroup.daysLeft} days left</p>
        <div className="cb-hero-bar" role="presentation"><div style={{ width: `${groupPct}%` }} /></div>
        <div className="cb-hero-meta">
          <button type="button" onClick={() => setDetail({ kind: 'owes' })}>View who owes what ›</button>
          {activeGroup.canEditPlan && <button type="button" onClick={() => setDetail({ kind: 'groupPlan' })}>Edit plan ›</button>}
        </div>
      </section>
      {activeGroup.plannedCents > 0 && activeGroup.spentCents > activeGroup.plannedCents && <p className="cb-notice cb-warn" role="status">
        Over the shared plan by {formatCents(activeGroup.spentCents - activeGroup.plannedCents)} this month.</p>}

      <h2 className="cb-section-heading">Shared expenses</h2>
      {activeGroup.members.map(member => <div key={member.id} className="cb-category cb-member">
        <div className="cb-category-head">
          <span className="cb-member-name"><Avatar name={member.name} color={member.avatarColor} /><strong>{member.name}</strong></span>
          <span className={member.oweCents ? 'cb-owe' : ''}>{member.oweCents ? `Owes ${formatCents(member.oweCents)}` : `${formatCents(member.paidCents)} paid`}</span>
        </div>
        <div className="cb-category-bar" role="presentation"><div style={{ width: `${member.pct}%`, background: member.barColor }} /></div>
      </div>)}

      <div className="cb-notice cb-settle" role="status">
        {remainingOwed === 0 ? <><strong>All settled up</strong><p>Nobody owes anything in this group right now.</p></> : <>
          <strong>{formatCents(remainingOwed)} left to settle</strong>
          <p>{settleUpBody(activeGroup)}</p></>}
      </div>

    </>) : (!personal || !period ? (personalError ? retry(personalError) : <p className="cb-notice" role="status">Loading your budget…</p>) : <>
      <section className="cb-hero" aria-label="Budget summary">
        <strong className="cb-hero-amount">{formatCents(spent)} spent</strong>
        <p className="cb-hero-sub">{planned ? `of ${formatCents(planned)} planned` : 'No category limits set'} · {period.daysLeft} days left</p>
        <div className="cb-hero-bar" role="presentation"><div style={{ width: `${pct}%` }} /></div>
        <div className="cb-hero-meta">
          <span>{personal.lastSyncedAt ? `↻ Bank synced ${relativeTime(personal.lastSyncedAt)}` : '↻ No bank synced yet'}</span>
          <button type="button" onClick={() => setDetail({ kind: 'insights' })}>View insights ›</button>
        </div>
      </section>
      {!personal.hasBankConnection && <p className="cb-notice" role="status">Connect a bank account in Profile to see your spending here.</p>}
      {overLimit.length > 0 && <p className="cb-notice cb-warn" role="status">Over budget this month: {overLimit.map(item => item.label).join(', ')}.</p>}

      <div className="cb-section-row"><h2 className="cb-section-heading">Category plan</h2>
        <button type="button" className="cb-simulator-link" onClick={() => setDetail({ kind: 'limits' })}>Edit limits</button></div>
      {budgets.map(item => <button key={item.key} type="button" className="cb-category cb-row-button"
        aria-label={`${item.label} transactions`} onClick={() => setDetail({ kind: 'category', key: item.key, from: 'budget' })}>
        <div className="cb-category-head">
          <strong>{item.label}</strong>
          <span>{formatCents(item.spentCents)} / {formatCents(item.plannedCents)}</span>
        </div>
        <div className="cb-category-bar" role="presentation"><div style={{ width: `${categoryPct(item)}%`, background: isOverLimit(item) ? '#b04a37' : item.color }} /></div>
      </button>)}

    </>)}
  </main>;
}
