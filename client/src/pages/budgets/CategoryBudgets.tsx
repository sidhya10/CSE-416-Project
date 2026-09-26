import { useState } from 'react';
import Avatar from '../../components/common/Avatar';
import { formatCents } from '../expenses/split';
import { CATEGORY_BUDGETS, DAYS_LEFT, LAST_SYNCED_LABEL, categoryPct, totalPlannedCents, totalSpentCents } from './categoryPlan';
import { GROUP_BUDGET, groupBudgetPct } from './groupBudgetPlan';
import './categoryBudgets.css';

type BudgetScope = 'personal' | 'group';

export default function CategoryBudgets() {
  const [scope, setScope] = useState<BudgetScope>('personal');
  const [notice, setNotice] = useState('');

  const spent = totalSpentCents(CATEGORY_BUDGETS);
  const planned = totalPlannedCents(CATEGORY_BUDGETS);
  const pct = planned ? Math.min(100, Math.max(0, (spent / planned) * 100)) : 0;
  const groupPct = groupBudgetPct(GROUP_BUDGET);

  return <main className="cb-screen">
    <header className="cb-header">
      {scope === 'group' ? <>
        <h1>{GROUP_BUDGET.name}</h1>
        <p>{GROUP_BUDGET.memberInfo}</p>
      </> : <>
        <h1>Personal budget</h1>
        <p>Budgets, bank sync, and spending insights</p>
      </>}
    </header>

    <div className="cb-toggle" role="tablist" aria-label="Budget scope">
      <button type="button" role="tab" aria-selected={scope === 'personal'} className={scope === 'personal' ? 'active' : ''} onClick={() => setScope('personal')}>Personal</button>
      <button type="button" role="tab" aria-selected={scope === 'group'} className={scope === 'group' ? 'active' : ''} onClick={() => setScope('group')}>Group</button>
    </div>

    {scope === 'group' ? <>
      <section className="cb-hero" aria-label="Group budget summary">
        <strong className="cb-hero-amount">{formatCents(GROUP_BUDGET.spentCents)} spent</strong>
        <p className="cb-hero-sub">of {formatCents(GROUP_BUDGET.plannedCents)} shared plan · {GROUP_BUDGET.daysLeft} days left</p>
        <div className="cb-hero-bar" role="presentation"><div style={{ width: `${groupPct}%` }} /></div>
        <div className="cb-hero-meta">
          <button type="button" onClick={() => setNotice('Settlement details are not connected yet.')}>View who owes what ›</button>
        </div>
      </section>

      <h2 className="cb-section-heading">Shared expenses</h2>
      {GROUP_BUDGET.members.map(member => <div key={member.id} className="cb-category cb-member">
        <div className="cb-category-head">
          <span className="cb-member-name"><Avatar name={member.name} color={member.avatarColor} /><strong>{member.name}</strong></span>
          <span className={member.oweCents ? 'cb-owe' : ''}>
            {member.paidCents !== undefined ? `${formatCents(member.paidCents)} paid` : `You owe ${formatCents(member.oweCents ?? 0)}`}
          </span>
        </div>
        <div className="cb-category-bar" role="presentation"><div style={{ width: `${member.pct}%`, background: member.barColor }} /></div>
      </div>)}

      <div className="cb-notice cb-settle" role="status">
        <strong>{GROUP_BUDGET.settleUp.title}</strong>
        <p>{GROUP_BUDGET.settleUp.body}</p>
      </div>

      {notice && <p className="cb-notice" role="status">{notice}</p>}
    </> : <>
      <section className="cb-hero" aria-label="Budget summary">
        <strong className="cb-hero-amount">{formatCents(spent)} spent</strong>
        <p className="cb-hero-sub">of {formatCents(planned)} planned · {DAYS_LEFT} days left</p>
        <div className="cb-hero-bar" role="presentation"><div style={{ width: `${pct}%` }} /></div>
        <div className="cb-hero-meta">
          <span>↻ Bank synced {LAST_SYNCED_LABEL}</span>
          <button type="button" onClick={() => setNotice('Spending insights are not connected yet.')}>View insights ›</button>
        </div>
      </section>

      <h2 className="cb-section-heading">Category plan</h2>
      {CATEGORY_BUDGETS.map(item => <div key={item.key} className="cb-category">
        <div className="cb-category-head">
          <strong>{item.label}</strong>
          <span>{formatCents(item.spentCents)} / {formatCents(item.plannedCents)}</span>
        </div>
        <div className="cb-category-bar" role="presentation"><div style={{ width: `${categoryPct(item)}%`, background: item.color }} /></div>
      </div>)}

      {notice && <p className="cb-notice" role="status">{notice}</p>}
    </>}
  </main>;
}
