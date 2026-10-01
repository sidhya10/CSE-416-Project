import { useState } from 'react';
import Avatar from '../../components/common/Avatar';
import { formatCents } from '../expenses/split';
import { CATEGORY_BUDGETS, type CategoryBudget, type CategoryKey, DAYS_LEFT, LAST_SYNCED_LABEL, categoryPct, totalPlannedCents, totalSpentCents } from './categoryPlan';
import { DEFAULT_GROUP_BUDGET, GROUP_BUDGETS, groupBudgetPct, remainingOwedCents } from './groupBudgetPlan';
import { CategoryTransactions, EditLimits, SpendingInsights, WhoOwesWhat } from './CategoryBudgetDetails';
import './categoryBudgets.css';

type BudgetScope = 'personal' | 'group';
type Detail = { kind: 'insights' } | { kind: 'category'; key: CategoryKey; from: 'budget' | 'insights' } | { kind: 'owes' } | { kind: 'limits' } | null;

export default function CategoryBudgets({ onOpenSimulator }: { onOpenSimulator: () => void }) {
  const [scope, setScope] = useState<BudgetScope>('personal');
  const [activeGroupId, setActiveGroupId] = useState(DEFAULT_GROUP_BUDGET.id);
  const [detail, setDetail] = useState<Detail>(null);
  const [budgets, setBudgets] = useState<CategoryBudget[]>(CATEGORY_BUDGETS);
  const [settled, setSettled] = useState<Record<number, string[]>>({});

  const spent = totalSpentCents(budgets);
  const planned = totalPlannedCents(budgets);
  const pct = planned ? Math.min(100, Math.max(0, (spent / planned) * 100)) : 0;

  const activeGroup = GROUP_BUDGETS.find(group => group.id === activeGroupId) ?? DEFAULT_GROUP_BUDGET;
  const groupPct = groupBudgetPct(activeGroup);
  const settledKeys = settled[activeGroup.id] ?? [];
  const remainingOwed = remainingOwedCents(activeGroup, settledKeys);
  const settleTotal = remainingOwedCents(activeGroup, []);
  const toggleSettled = (key: string) => setSettled(prev => {
    const current = prev[activeGroup.id] ?? [];
    return { ...prev, [activeGroup.id]: current.includes(key) ? current.filter(k => k !== key) : [...current, key] };
  });

  if (detail) {
    const item = detail.kind === 'category' ? budgets.find(c => c.key === detail.key) : undefined;
    return <main className="cb-screen">
      {detail.kind === 'insights' && <SpendingInsights budgets={budgets} onBack={() => setDetail(null)} onSelectCategory={key => setDetail({ kind: 'category', key, from: 'insights' })} />}
      {item && detail.kind === 'category' && <CategoryTransactions item={item} onBack={() => setDetail(detail.from === 'insights' ? { kind: 'insights' } : null)} />}
      {detail.kind === 'limits' && <EditLimits budgets={budgets} onCancel={() => setDetail(null)} onSave={next => { setBudgets(next); setDetail(null); }} />}
      {detail.kind === 'owes' && <WhoOwesWhat group={activeGroup} settledKeys={settledKeys} onToggleSettled={toggleSettled} onBack={() => setDetail(null)} />}
    </main>;
  }

  return <main className="cb-screen">
    <header className="cb-header">
      {scope === 'group' ? <>
        <h1>{activeGroup.name}</h1>
        <p>{activeGroup.memberInfo}</p>
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

    {scope === 'group' ? <>
      <div className="cb-group-picker" role="tablist" aria-label="Select group">
        {GROUP_BUDGETS.map(group => <button key={group.id} type="button" role="tab" aria-selected={group.id === activeGroupId}
          className={group.id === activeGroupId ? 'active' : ''} onClick={() => setActiveGroupId(group.id)}>
          <Avatar name={group.name} color={group.color} />
          {group.name}
        </button>)}
      </div>

      <section className="cb-hero" aria-label="Group budget summary">
        <strong className="cb-hero-amount">{formatCents(activeGroup.spentCents)} spent</strong>
        <p className="cb-hero-sub">of {formatCents(activeGroup.plannedCents)} shared plan · {activeGroup.daysLeft} days left</p>
        <div className="cb-hero-bar" role="presentation"><div style={{ width: `${groupPct}%` }} /></div>
        <div className="cb-hero-meta">
          <button type="button" onClick={() => setDetail({ kind: 'owes' })}>View who owes what ›</button>
        </div>
      </section>

      <h2 className="cb-section-heading">Shared expenses</h2>
      {activeGroup.members.map(member => {
        const owed = member.oweCents ?? 0;
        const remaining = remainingOwedCents(activeGroup, settledKeys, member.id);
        const settledPct = owed ? member.pct * ((owed - remaining) / owed) : 0;
        return <div key={member.id} className="cb-category cb-member">
          <div className="cb-category-head">
            <span className="cb-member-name"><Avatar name={member.name} color={member.avatarColor} /><strong>{member.name}</strong></span>
            <span className={remaining ? 'cb-owe' : ''}>
              {member.paidCents !== undefined ? `${formatCents(member.paidCents)} paid`
                : remaining ? `Owes ${formatCents(remaining)}` : `Paid ${formatCents(owed)}`}
            </span>
          </div>
          {owed ? <div className="cb-category-bar cb-split-bar" role="presentation">
            <div style={{ width: `${settledPct}%`, background: '#3f9d72' }} />
            <div style={{ width: `${member.pct - settledPct}%`, background: member.barColor }} />
          </div> : <div className="cb-category-bar" role="presentation"><div style={{ width: `${member.pct}%`, background: member.barColor }} /></div>}
        </div>;
      })}

      <div className="cb-notice cb-settle" role="status">
        {remainingOwed === 0 ? <><strong>All settled up</strong><p>Nobody owes anything in this group right now.</p></> : <>
          <strong>{remainingOwed === settleTotal ? activeGroup.settleUp.title : `${formatCents(remainingOwed)} left to settle`}</strong>
          <p>{activeGroup.settleUp.body}</p></>}
      </div>

    </> : <>
      <section className="cb-hero" aria-label="Budget summary">
        <strong className="cb-hero-amount">{formatCents(spent)} spent</strong>
        <p className="cb-hero-sub">of {formatCents(planned)} planned · {DAYS_LEFT} days left</p>
        <div className="cb-hero-bar" role="presentation"><div style={{ width: `${pct}%` }} /></div>
        <div className="cb-hero-meta">
          <span>↻ Bank synced {LAST_SYNCED_LABEL}</span>
          <button type="button" onClick={() => setDetail({ kind: 'insights' })}>View insights ›</button>
        </div>
      </section>

      <div className="cb-section-row"><h2 className="cb-section-heading">Category plan</h2>
        <button type="button" className="cb-simulator-link" onClick={() => setDetail({ kind: 'limits' })}>Edit limits</button></div>
      {budgets.map(item => <button key={item.key} type="button" className="cb-category cb-row-button"
        aria-label={`${item.label} transactions`} onClick={() => setDetail({ kind: 'category', key: item.key, from: 'budget' })}>
        <div className="cb-category-head">
          <strong>{item.label}</strong>
          <span>{formatCents(item.spentCents)} / {formatCents(item.plannedCents)}</span>
        </div>
        <div className="cb-category-bar" role="presentation"><div style={{ width: `${categoryPct(item)}%`, background: item.color }} /></div>
      </button>)}

    </>}
  </main>;
}
