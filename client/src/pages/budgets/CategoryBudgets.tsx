import { useState } from 'react';
import { formatCents } from '../expenses/split';
import { CATEGORY_BUDGETS, DAYS_LEFT, LAST_SYNCED_LABEL, categoryPct, totalPlannedCents, totalSpentCents } from './categoryPlan';
import './categoryBudgets.css';

type BudgetScope = 'personal' | 'group';

export default function CategoryBudgets() {
  const [scope, setScope] = useState<BudgetScope>('personal');
  const [notice, setNotice] = useState('');

  const spent = totalSpentCents(CATEGORY_BUDGETS);
  const planned = totalPlannedCents(CATEGORY_BUDGETS);
  const pct = planned ? Math.min(100, Math.max(0, (spent / planned) * 100)) : 0;

  return <main className="cb-screen">
    <header className="cb-header">
      <h1>Personal budget</h1>
      <p>Budgets, bank sync, and spending insights</p>
    </header>

    <div className="cb-toggle" role="tablist" aria-label="Budget scope">
      <button type="button" role="tab" aria-selected={scope === 'personal'} className={scope === 'personal' ? 'active' : ''} onClick={() => setScope('personal')}>Personal</button>
      <button type="button" role="tab" aria-selected={scope === 'group'} className={scope === 'group' ? 'active' : ''} onClick={() => setScope('group')}>Group</button>
    </div>

    {scope === 'group' ? <p className="cb-empty">Group budgets aren't available in this preview yet.</p> : <>
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
