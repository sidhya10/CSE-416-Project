import { useState } from 'react';
import { CATEGORY_BUDGETS, categoryPct, totalPlannedCents, totalSpentCents } from '../budgets/categoryPlan';
import { formatCents } from '../expenses/split';
import {
  GREETING_MONTH, GREETING_NAME, GROUP_UPDATES_COUNT, MONTHS, RECENT_ACTIVITY, SYNCED_LABEL, TODOS,
  barHeightPct, maxMonthCents,
} from './dashboard';
import './dashboard.css';

export default function HomeDashboard() {
  const [notice, setNotice] = useState('');

  const spent = totalSpentCents(CATEGORY_BUDGETS);
  const planned = totalPlannedCents(CATEGORY_BUDGETS);
  const left = planned - spent;
  const pct = planned ? Math.min(100, Math.max(0, (spent / planned) * 100)) : 0;
  const topCategories = CATEGORY_BUDGETS.slice(0, 3);
  const chartMax = maxMonthCents(MONTHS);

  return <main className="home-screen">
    <header className="home-header">
      <div>
        <h1>Good morning, {GREETING_NAME}</h1>
        <p>{GREETING_MONTH}</p>
      </div>
      <button type="button" className="home-gear" aria-label="Settings" onClick={() => setNotice('Use the Profile tab to reach settings.')}>⚙</button>
    </header>
    <span className="home-synced-badge">↻ {SYNCED_LABEL}</span>

    <section className="home-hero" aria-label="Budget summary">
      <div className="home-hero-top">
        <strong>{formatCents(spent)}</strong>
        <span>{formatCents(left)} left</span>
      </div>
      <p className="home-hero-sub">spent of {formatCents(planned)} budget</p>
      <div className="home-hero-bar" role="presentation"><div style={{ width: `${pct}%` }} /></div>
    </section>

    <section className="home-card">
      <h2>Spending by category</h2>
      {topCategories.map(item => <div key={item.key} className="home-category-row">
        <div className="home-category-head"><strong>{item.label}</strong><span>{Math.round(categoryPct(item))}%</span></div>
        <div className="home-category-bar" role="presentation"><div style={{ width: `${categoryPct(item)}%`, background: item.color }} /></div>
      </div>)}
    </section>

    <section className="home-card">
      <div className="home-chart-head"><h2>Spending & income</h2><small>Last 4 months</small></div>
      <div className="home-chart-legend"><span><i className="spending" />Spending</span><span><i className="income" />Income</span></div>
      <div className="home-chart">
        {MONTHS.map(month => <div key={month.label} className="home-chart-col">
          <div className="home-chart-bars">
            <div className="bar spending" style={{ height: `${barHeightPct(month.spendingCents, chartMax)}%` }} />
            <div className="bar income" style={{ height: `${barHeightPct(month.incomeCents, chartMax)}%` }} />
          </div>
          <span>{month.label}</span>
        </div>)}
      </div>
    </section>

    <section className="home-card">
      <div className="home-todos-head">
        <div><h2>Your to-dos</h2><small>{TODOS.length} items need attention</small></div>
        <span className="home-pill">{GROUP_UPDATES_COUNT} group updates</span>
      </div>
      {TODOS.map(todo => <div key={todo.id} className="home-todo-row">
        <span>{todo.label}</span>
        {todo.interactive
          ? <button type="button" onClick={() => setNotice(`"${todo.label}" isn't connected yet.`)}>{todo.trailing}</button>
          : <b>{todo.trailing}</b>}
      </div>)}
    </section>

    <p className="home-recent">Recent: {RECENT_ACTIVITY}</p>

    {notice && <p className="home-notice" role="status">{notice}</p>}
  </main>;
}
