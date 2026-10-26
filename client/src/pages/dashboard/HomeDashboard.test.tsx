import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ApiGroupBudget, ApiHomeSummary, ApiPersonalBudget } from '../../api/budgets.api';
import HomeDashboard from './HomeDashboard';
import { barHeightPct, buildTodos, firstName, greetingFor, maxMonthCents, toMonthPoints } from './dashboard';

const personal = (overrides: Partial<ApiPersonalBudget> = {}): ApiPersonalBudget => ({
  month: '2026-10', daysInMonth: 31, daysLeft: 15, hasBankConnection: true, lastSyncedAt: Date.now() - 2 * 60_000,
  categories: [
    { key: 'dining', plannedCents: 36500, spentCents: 40000 }, { key: 'groceries', plannedCents: 35000, spentCents: 18600 },
    { key: 'transit', plannedCents: 20000, spentCents: 0 }, { key: 'shopping', plannedCents: 32500, spentCents: 30100 },
    { key: 'other', plannedCents: 0, spentCents: 500 },
  ],
  transactions: { dining: [], groceries: [], transit: [], shopping: [], other: [] },
  ...overrides,
});
const groups = (): ApiGroupBudget[] => [{
  id: 'g1', name: 'Weekend Trip', color: 'gold', type: 'Trip', memberCount: 2, spentCents: 4000, plannedCents: 0, daysLeft: 15, canEditPlan: true,
  members: [
    { id: 'me', name: 'Nicole', isYou: true, paidCents: 0, owesCents: 3820, owedCents: 0 },
    { id: 'alex', name: 'Alex', isYou: false, paidCents: 4000, owesCents: 0, owedCents: 3820 },
  ],
}];
const home = (): ApiHomeSummary => ({
  history: [{ month: '2026-07', spendingCents: 62000, incomeCents: 180000 }, { month: '2026-08', spendingCents: 0, incomeCents: 0 },
    { month: '2026-09', spendingCents: 105750, incomeCents: 220000 }, { month: '2026-10', spendingCents: 89100, incomeCents: 0 }],
  pendingPayments: { count: 2, cents: 1500 },
  latestExpense: { title: 'Dinner', groupName: 'Weekend Trip', creatorName: 'Alex', isYou: false, totalCents: 4000, createdAt: '2026-10-15T00:00:00.000Z' },
});

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function stubApi(data: { personal?: ApiPersonalBudget; groups?: ApiGroupBudget[]; home?: ApiHomeSummary } = {}, overrides: Record<string, () => Response> = {}) {
  const urls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(url);
    const override = overrides[url.replace(/^\/api/, '')];
    if (override) return override();
    if (url.endsWith('/budgets/personal')) return json(data.personal ?? personal());
    if (url.endsWith('/budgets/groups')) return json({ groups: data.groups ?? groups() });
    if (url.endsWith('/budgets/home')) return json(data.home ?? home());
    if (url.endsWith('/settlement-notices')) return json({ notices: [] });
    throw new Error(`Unexpected request ${url}`);
  }));
  return urls;
}
afterEach(() => vi.unstubAllGlobals());

describe('dashboard helpers', () => {
  it('greets by time of day and by first name', () => {
    expect([greetingFor(6), greetingFor(12), greetingFor(17), greetingFor(18), greetingFor(23)]).toEqual(['Good morning', 'Good afternoon', 'Good afternoon', 'Good evening', 'Good evening']);
    expect(firstName('  Nicole Lui-Leung ')).toBe('Nicole');
    expect(firstName('   ')).toBe('there');
  });
  it('labels months without timezone drift and scales bars to the largest value', () => {
    const points = toMonthPoints(home().history);
    expect(points.map(point => point.label)).toEqual(['Jul', 'Aug', 'Sep', 'Oct']);
    expect(maxMonthCents(points)).toBe(220000);
    expect(barHeightPct(110000, 220000)).toBe(50);
    expect(barHeightPct(5, 0)).toBe(0);
  });
  it('builds to-dos from payments, balances, and categories over their limit', () => {
    const budgets = [{ key: 'dining' as const, label: 'Dining', color: '', plannedCents: 100, spentCents: 200 }];
    expect(buildTodos(groups(), home(), budgets).map(todo => todo.label)).toEqual([
      'Confirm 2 payments sent to you ($15.00)', 'You owe $38.20 in 1 group', 'Over budget: Dining',
    ]);
    expect(buildTodos([], null, [])).toEqual([]);
  });
});

describe('home dashboard with real data', () => {
  it('shows the user\'s name, budget totals, top categories, monthly history, to-dos, and latest expense', async () => {
    stubApi();
    render(<HomeDashboard userName="Nicole Lui-Leung" onNavigate={() => {}} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Good (morning|afternoon|evening), Nicole$/);
    expect(await screen.findByText('$892.00')).toBeInTheDocument();
    expect(screen.getByText('spent of $1,240.00 budget')).toBeInTheDocument();
    expect(screen.getByText('$348.00 left')).toBeInTheDocument();
    expect(screen.getByText('↻ Synced 2m ago')).toBeInTheDocument();
    const categories = within(screen.getByRole('heading', { name: 'Spending by category' }).closest('section')!);
    expect(categories.getAllByText(/^(Dining|Shopping|Groceries)$/).map(node => node.textContent)).toEqual(['Dining', 'Shopping', 'Groceries']);
    expect(categories.getByText('100%')).toBeInTheDocument();
    expect(categories.getByText('93%')).toBeInTheDocument();
    expect(categories.queryByText('Transit')).not.toBeInTheDocument();
    for (const label of ['Jul', 'Aug', 'Sep', 'Oct']) expect(screen.getByText(label)).toBeInTheDocument();
    expect(await screen.findByText('Confirm 2 payments sent to you ($15.00)')).toBeInTheDocument();
    const todos = screen.getByRole('region', { name: 'Your to-dos' });
    expect(todos.compareDocumentPosition(screen.getByRole('region', { name: 'Budget summary' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Group payment notifications' })).not.toBeInTheDocument();
    expect(screen.getByText('You owe $38.20 in 1 group')).toBeInTheDocument();
    expect(screen.getByText('Over budget: Dining')).toBeInTheDocument();
    expect(screen.getByText('3 items need attention')).toBeInTheDocument();
    expect(screen.getByText('Latest: Alex added Dinner in Weekend Trip · $40.00')).toBeInTheDocument();
    expect(screen.queryByText(/Apartment rent|matched bank charge|group updates/)).not.toBeInTheDocument();
  });

  it('shows empty states for a new account', async () => {
    stubApi({
      personal: personal({ hasBankConnection: false, lastSyncedAt: null, categories: personal().categories.map(c => ({ ...c, plannedCents: 0, spentCents: 0 })) }),
      groups: [], home: { history: home().history.map(m => ({ ...m, spendingCents: 0, incomeCents: 0 })), pendingPayments: { count: 0, cents: 0 }, latestExpense: null },
    });
    render(<HomeDashboard userName="New" onNavigate={() => {}} />);
    expect(await screen.findByText('No limits set')).toBeInTheDocument();
    expect(screen.getByText('↻ No bank synced yet')).toBeInTheDocument();
    expect(screen.getByText('Connect a bank account in Profile to see your spending.')).toBeInTheDocument();
    expect(screen.getByText('No bank transactions in these months yet.')).toBeInTheDocument();
    expect(await screen.findByText("You're all caught up.")).toBeInTheDocument();
    expect(screen.getByText('Nothing needs attention')).toBeInTheDocument();
    expect(screen.queryByText(/^Latest:/)).not.toBeInTheDocument();
  });

  it('shows how far over the plan the user is', async () => {
    stubApi({ personal: personal({ categories: personal().categories.map(c => c.key === 'dining' ? { ...c, spentCents: 200000 } : c) }) });
    render(<HomeDashboard userName="Nicole" onNavigate={() => {}} />);
    expect(await screen.findByText('$1,252.00 over')).toBeInTheDocument();
  });

  it('opens the related tab from a to-do or the settings button', async () => {
    stubApi();
    const onNavigate = vi.fn();
    render(<HomeDashboard userName="Nicole" onNavigate={onNavigate} />);
    const rows = await screen.findAllByText(/^(Review|Settle|View) ›$/);
    fireEvent.click(rows[0]!);
    fireEvent.click(rows[rows.length - 1]!);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(onNavigate.mock.calls.map(call => call[0])).toEqual(['Groups', 'Budget', 'Profile']);
  });

  it('does not fetch while hidden, then loads when shown', async () => {
    const urls = stubApi();
    const { rerender } = render(<HomeDashboard userName="Nicole" active={false} onNavigate={() => {}} />);
    expect(urls).toHaveLength(0);
    rerender(<HomeDashboard userName="Nicole" active onNavigate={() => {}} />);
    expect(await screen.findByText('$892.00')).toBeInTheDocument();
    expect(urls.sort()).toEqual(['/api/budgets/groups', '/api/budgets/home', '/api/budgets/personal']);
  });

  it('shows an error with a retry when the data cannot load', async () => {
    let attempts = 0;
    stubApi({}, { '/budgets/personal': () => ++attempts === 1 ? json({ error: 'Boom' }, 500) : json(personal()) });
    render(<HomeDashboard userName="Nicole" onNavigate={() => {}} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Boom');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('$892.00')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
