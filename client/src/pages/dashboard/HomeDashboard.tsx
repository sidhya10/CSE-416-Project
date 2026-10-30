import { useEffect } from 'react';
import { budgetsApi } from '../../api/budgets.api';
import { bankingApi } from '../../api/banking.api';
import { relativeTime } from '../../utils/dates';
import { budgetPeriod, categoryPct, toCategoryBudgets, totalPlannedCents, totalSpentCents } from '../budgets/categoryPlan';
import { formatCents } from '../expenses/split';
import { barHeightPct, buildTodos, firstName, greetingFor, maxMonthCents, toMonthPoints, type TodoTarget } from './dashboard';
import { useLiveData } from './useLiveData';
import './dashboard.css';

const loadUnreviewedTransactions = () => bankingApi.transactions('unreviewed');

// `active` is false while the tab is hidden: nothing is fetched or refreshed until the user opens Home.
export default function HomeDashboard({ userName, onNavigate, onReviewTransactions = () => {}, onReviewCountChange, active = true }: {
  userName: string; onNavigate: (target: TodoTarget | 'Profile') => void; onReviewTransactions?: () => void; onReviewCountChange?: (count: number) => void; active?: boolean;
}) {
  const personal = useLiveData(budgetsApi.personal, active);
  const groups = useLiveData(budgetsApi.groups, active);
  const home = useLiveData(budgetsApi.home, active);
  const reviews = useLiveData(loadUnreviewedTransactions, active);
  const retry = () => { void personal.refresh(); void groups.refresh(); void home.refresh(); void reviews.refresh(); };

  const budgets = personal.data ? toCategoryBudgets(personal.data.categories) : [];
  const spent = totalSpentCents(budgets);
  const planned = totalPlannedCents(budgets);
  const left = planned - spent;
  const pct = planned ? Math.min(100, Math.max(0, (spent / planned) * 100)) : 0;
  const topCategories = [...budgets].filter(item => item.spentCents > 0).sort((a, b) => b.spentCents - a.spentCents).slice(0, 3);
  const months = home.data ? toMonthPoints(home.data.history) : [];
  const chartMax = maxMonthCents(months);
  const todos = buildTodos(groups.data?.groups ?? [], home.data);
  const loaded = !!personal.data && !!groups.data && !!home.data;
  const failed = [personal, groups, home].some(source => !source.data && source.error);
  const monthLabel = personal.data ? budgetPeriod(personal.data).monthLabel : new Date().toLocaleDateString('en-US', { month: 'long' });
  const latest = home.data?.latestExpense;
  const unreviewed = reviews.data?.transactions ?? [];
  const attentionCount = todos.length + (unreviewed.length ? 1 : 0);

  useEffect(() => {
    if (reviews.data) onReviewCountChange?.(reviews.data.transactions.length);
  }, [onReviewCountChange, reviews.data]);

  return <main className="home-screen">
    <header className="home-header">
      <div>
        <h1>{greetingFor(new Date().getHours())}, {firstName(userName)}</h1>
        <p>{monthLabel}</p>
      </div>
      <div className="home-header-actions">
      <button type="button" className="home-gear" aria-label="Settings" onClick={() => onNavigate('Profile')}>⚙</button></div>
    </header>
    {personal.data && <span className="home-synced-badge">{personal.data.lastSyncedAt ? `↻ Synced ${relativeTime(personal.data.lastSyncedAt)}` : '↻ No bank synced yet'}</span>}

    {failed && <div className="home-notice home-error" role="alert">
      <p>{personal.error || groups.error || home.error}</p><button type="button" className="home-retry" onClick={retry}>Retry</button>
    </div>}
    {!failed && !loaded && <p className="home-notice" role="status">Loading your dashboard…</p>}

    {loaded && <section className="home-card home-todos" aria-label="Your to-dos">
      <div className="home-todos-head">
        <div><h2>Your to-dos</h2><small>{attentionCount ? `${attentionCount} ${attentionCount === 1 ? 'item needs' : 'items need'} attention` : 'Nothing needs attention'}</small></div>
      </div>
      {attentionCount === 0 && <p className="home-empty">You're all caught up.</p>}
      {todos.map(todo => <div key={todo.id} className="home-todo-row">
        <span>{todo.label}</span>
        <button type="button" onClick={() => onNavigate(todo.target)}>{todo.trailing}</button>
      </div>)}
      {unreviewed.length > 0 && <div className="home-todo-row">
        <span>Categorize {unreviewed.length} {unreviewed.length === 1 ? 'transaction' : 'transactions'}</span>
        <button type="button" onClick={onReviewTransactions}>Open ›</button>
      </div>}
    </section>}

    {personal.data && <>
      <section className="home-hero" aria-label="Budget summary">
        <div className="home-hero-top">
          <strong>{formatCents(spent)}</strong>
          <span>{planned ? (left >= 0 ? `${formatCents(left)} left` : `${formatCents(-left)} over`) : 'No limits set'}</span>
        </div>
        <p className="home-hero-sub">{planned ? `spent of ${formatCents(planned)} budget` : 'spent this month'}</p>
        <div className="home-hero-bar" role="presentation"><div style={{ width: `${pct}%` }} /></div>
      </section>

      <section className="home-card">
        <h2>Spending by category</h2>
        {topCategories.length === 0 && <p className="home-empty">{personal.data.hasBankConnection ? 'No spending yet this month.' : 'Connect a bank account in Profile to see your spending.'}</p>}
        {topCategories.map(item => {
          const share = item.plannedCents ? categoryPct(item) : spent ? (item.spentCents / spent) * 100 : 0;
          return <div key={item.key} className="home-category-row">
            <div className="home-category-head"><strong>{item.label}</strong><span>{item.plannedCents ? `${Math.round(share)}%` : formatCents(item.spentCents)}</span></div>
            <div className="home-category-bar" role="presentation"><div style={{ width: `${share}%`, background: item.color }} /></div>
          </div>;
        })}
      </section>
    </>}

    {home.data && <section className="home-card">
      <div className="home-chart-head"><h2>Spending & income</h2><small>Last {months.length} months</small></div>
      <div className="home-chart-legend"><span><i className="spending" />Spending</span><span><i className="income" />Income</span></div>
      <div className="home-chart">
        {months.map(month => <div key={month.label} className="home-chart-col">
          <div className="home-chart-bars">
            <div className="bar spending" style={{ height: `${barHeightPct(month.spendingCents, chartMax)}%` }} />
            <div className="bar income" style={{ height: `${barHeightPct(month.incomeCents, chartMax)}%` }} />
          </div>
          <span>{month.label}</span>
        </div>)}
      </div>
      {chartMax === 0 && <p className="home-empty">No bank transactions in these months yet.</p>}
    </section>}



    {latest && <p className="home-recent">Latest: {latest.isYou ? 'You' : latest.creatorName} added {latest.title} in {latest.groupName} · {formatCents(latest.totalCents)}</p>}
  </main>;
}
