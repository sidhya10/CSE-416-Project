import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ApiGroupBudget, ApiPersonalBudget, CategoryKey } from '../../api/budgets.api';
import CategoryBudgets from './CategoryBudgets';
import { budgetPeriod, categoryInsights, isOverLimit, toCategoryBudgets, toCategoryTransactions } from './categoryPlan';
import { settleUpBody, settlementsFor, toGroupBudget, totalOwedCents } from './groupBudgetPlan';

const txn = (id: string, merchant: string, amountCents: number, date = '2026-09-28') => ({ id, merchant, date, amountCents, pending: false });
const personalFixture = (overrides: Partial<Record<CategoryKey, { plannedCents?: number; spentCents?: number }>> = {}): ApiPersonalBudget => ({
  month: '2026-09', daysInMonth: 30, daysLeft: 12, hasBankConnection: true, lastSyncedAt: Date.now() - 2 * 60_000,
  categories: ([['dining', 36500, 24800], ['groceries', 35000, 18600], ['transit', 20000, 9200], ['shopping', 32500, 30100], ['other', 66000, 23050]] as const)
    .map(([key, plannedCents, spentCents]) => ({ key, plannedCents, spentCents, ...overrides[key] })),
  transactions: {
    dining: [txn('d1', 'Thai Basil', 4250), txn('d2', 'Blue Bottle Coffee', 650, '2026-09-25')],
    groceries: [txn('g1', "Trader Joe's", 5420)], transit: [], shopping: [txn('s1', 'Amazon', 8499)], other: [],
  },
});
const groupsFixture = (): ApiGroupBudget[] => [
  { id: 'g1', name: 'Weekend Trip', color: 'gold', type: 'Trip', memberCount: 3, spentCents: 68420, plannedCents: 90000, daysLeft: 12, canEditPlan: true,
    members: [
      { id: 'u1', name: 'Nicole', isYou: true, paidCents: 22000, owesCents: 0, owedCents: 2000 },
      { id: 'u2', name: 'Alex', isYou: false, paidCents: 28370, owesCents: 0, owedCents: 1820 },
      { id: 'u3', name: 'Jordan', isYou: false, paidCents: 0, owesCents: 3820, owedCents: 0 },
    ] },
  { id: 'g2', name: 'Shared Apartment', color: 'green', type: 'General', memberCount: 2, spentCents: 124000, plannedCents: 0, daysLeft: 12, canEditPlan: false,
    members: [
      { id: 'u1', name: 'Nicole', isYou: true, paidCents: 124000, owesCents: 0, owedCents: 0 },
      { id: 'u2', name: 'Alex', isYou: false, paidCents: 0, owesCents: 0, owedCents: 0 },
    ] },
];

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
type Calls = { method: string; url: string; body?: unknown }[];

// Stubs the budgets API; `handlers` can override a route, and every request is recorded.
function stubApi(handlers: Record<string, (init: RequestInit | undefined) => Response> = {}, data: { personal?: ApiPersonalBudget; groups?: ApiGroupBudget[] } = {}) {
  const calls: Calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const handler = handlers[`${method} ${url.replace(/^\/api/, '')}`];
    if (handler) return handler(init);
    if (url.endsWith('/budgets/personal')) return json(data.personal ?? personalFixture());
    if (url.endsWith('/budgets/groups')) return json({ groups: data.groups ?? groupsFixture() });
    throw new Error(`Unexpected request ${method} ${url}`);
  }));
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe('budget helpers', () => {
  it('flags categories projected over plan, ignoring categories with no limit', () => {
    const budgets = toCategoryBudgets(personalFixture().categories);
    expect(categoryInsights(budgets, 12, 30).filter(i => i.overPace).map(i => i.item.key)).toEqual(['dining', 'shopping']);
    const unlimited = toCategoryBudgets(personalFixture({ dining: { plannedCents: 0 } }).categories);
    expect(categoryInsights(unlimited, 12, 30).find(i => i.item.key === 'dining')?.overPace).toBe(false);
  });
  it('treats a $0 limit as no limit', () => {
    const [dining] = toCategoryBudgets(personalFixture({ dining: { plannedCents: 0, spentCents: 500 } }).categories);
    expect(isOverLimit(dining!)).toBe(false);
    const [over] = toCategoryBudgets(personalFixture({ dining: { spentCents: 40000 } }).categories);
    expect(isOverLimit(over!)).toBe(true);
  });
  it('formats the period and transaction dates without timezone drift', () => {
    expect(budgetPeriod(personalFixture())).toEqual({ monthLabel: 'September', daysLeft: 12, daysInMonth: 30 });
    expect(toCategoryTransactions([txn('a', 'X', 1, '2026-09-01')])[0]?.dateLabel).toBe('Sep 1');
  });
  it('settlements add up to what each group is owed', () => {
    for (const group of groupsFixture().map(toGroupBudget)) {
      expect(settlementsFor(group).reduce((sum, s) => sum + s.cents, 0)).toBe(totalOwedCents(group));
    }
  });
  it('splits a debt across creditors in proportion and conserves cents', () => {
    const group = toGroupBudget({ ...groupsFixture()[0]!, members: [
      { id: 'a', name: 'A', isYou: false, paidCents: 0, owesCents: 1001, owedCents: 0 },
      { id: 'b', name: 'B', isYou: false, paidCents: 0, owesCents: 0, owedCents: 600 },
      { id: 'c', name: 'C', isYou: false, paidCents: 0, owesCents: 0, owedCents: 401 },
    ] });
    const result = settlementsFor(group);
    expect(result.map(s => [s.toId, s.cents])).toEqual([['b', 600], ['c', 401]]);
    expect(settlementsFor(toGroupBudget({ ...groupsFixture()[0]!, members: [{ id: 'a', name: 'A', isYou: false, paidCents: 0, owesCents: 500, owedCents: 0 }] }))).toEqual([]);
  });
  it('describes who still owes', () => {
    expect(settleUpBody(toGroupBudget(groupsFixture()[0]!))).toContain('Jordan still owes');
  });
});

describe('personal budget from the API', () => {
  it('shows totals, bank sync, and the category plan', async () => {
    stubApi();
    render(<CategoryBudgets onOpenSimulator={() => {}} />);
    expect(await screen.findByText('$1,057.50 spent')).toBeInTheDocument();
    expect(screen.getByText('of $1,900.00 planned · 12 days left')).toBeInTheDocument();
    expect(screen.getByText('↻ Bank synced 2m ago')).toBeInTheDocument();
    expect(screen.getByText('$248.00 / $365.00')).toBeInTheDocument();
    expect(screen.queryByText(/Over budget this month/)).not.toBeInTheDocument();
  });
  it('does not fetch while its tab is hidden, then loads when shown', async () => {
    const calls = stubApi();
    const { rerender } = render(<CategoryBudgets active={false} onOpenSimulator={() => {}} />);
    expect(calls).toHaveLength(0);
    rerender(<CategoryBudgets active onOpenSimulator={() => {}} />);
    expect(await screen.findByText('$1,057.50 spent')).toBeInTheDocument();
    expect(calls.map(call => call.url)).toEqual(expect.arrayContaining(['/api/budgets/personal', '/api/budgets/groups']));
  });
  it('warns about categories over their limit', async () => {
    stubApi({}, { personal: personalFixture({ dining: { spentCents: 40000 } }) });
    render(<CategoryBudgets onOpenSimulator={() => {}} />);
    expect(await screen.findByText('Over budget this month: Dining.')).toBeInTheDocument();
  });
  it('prompts to connect a bank when there is no connection', async () => {
    stubApi({}, { personal: { ...personalFixture(), hasBankConnection: false, lastSyncedAt: null } });
    render(<CategoryBudgets onOpenSimulator={() => {}} />);
    expect(await screen.findByText(/Connect a bank account in Profile/)).toBeInTheDocument();
    expect(screen.getByText('↻ No bank synced yet')).toBeInTheDocument();
  });
  it('downloads this month as a CSV and shows an error when the export fails', async () => {
    let fail = false;
    const calls = stubApi({ 'GET /budgets/personal/export.csv': () => fail ? json({ error: 'Export broke' }, 500)
      : new Response('Date,Category\r\n', { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="personal-budget-2026-09.csv"' } }) });
    const createObjectURL = vi.fn(() => 'blob:csv'), revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<CategoryBudgets onOpenSimulator={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Export this month (CSV)' }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(calls.some(call => call.url.endsWith('/budgets/personal/export.csv'))).toBe(true);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:csv');
    fail = true;
    fireEvent.click(screen.getByRole('button', { name: 'Export this month (CSV)' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Export broke');
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });
  it('shows an error with a retry when the budget cannot load', async () => {
    let attempts = 0;
    stubApi({ 'GET /budgets/personal': () => ++attempts === 1 ? json({ error: 'Boom' }, 500) : json(personalFixture()) });
    render(<CategoryBudgets onOpenSimulator={() => {}} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Boom');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('$1,057.50 spent')).toBeInTheDocument();
  });
});

describe('budget drill-downs', () => {
  it('opens a category from the plan and goes back', async () => {
    stubApi();
    render(<CategoryBudgets onOpenSimulator={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Dining transactions' }));
    expect(screen.getByText('Thai Basil')).toBeInTheDocument();
    expect(screen.getByText('September transactions')).toBeInTheDocument();
    expect(screen.getByText('Sep 28')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Budget/ }));
    expect(screen.getByText('Category plan')).toBeInTheDocument();
  });
  it('says so when a category has no transactions', async () => {
    stubApi();
    render(<CategoryBudgets onOpenSimulator={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Transit transactions' }));
    expect(screen.getByText('No transactions in this category yet this month.')).toBeInTheDocument();
  });
  it('opens insights and drills into a category, returning to insights', async () => {
    stubApi();
    render(<CategoryBudgets onOpenSimulator={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /View insights/ }));
    expect(screen.getByText('Spending insights')).toBeInTheDocument();
    expect(screen.getByText('On pace to go over: Dining, Shopping.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Shopping/ }));
    expect(screen.getByText('Amazon')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Budget/ }));
    expect(screen.getByText('Spending insights')).toBeInTheDocument();
  });
});

describe('editable limits', () => {
  it('saves new limits to the API and reflects them on the plan', async () => {
    const calls = stubApi({ 'PUT /budgets/personal/limits': () => json(personalFixture({ dining: { plannedCents: 40000 } })) });
    render(<CategoryBudgets onOpenSimulator={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit limits' }));
    fireEvent.change(screen.getByLabelText('Dining limit'), { target: { value: '400' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save limits' }));
    expect(await screen.findByText('$248.00 / $400.00')).toBeInTheDocument();
    expect(calls.find(call => call.method === 'PUT')?.body).toEqual({ limits: { dining: 40000, groceries: 35000, transit: 20000, shopping: 32500, other: 66000 } });
  });
  it('blocks saving an invalid or excessive limit', async () => {
    const calls = stubApi();
    render(<CategoryBudgets onOpenSimulator={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit limits' }));
    fireEvent.change(screen.getByLabelText('Dining limit'), { target: { value: 'abc' } });
    expect(screen.getByRole('button', { name: 'Save limits' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Dining limit'), { target: { value: '1000000.01' } });
    expect(screen.getByRole('button', { name: 'Save limits' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Dining limit'), { target: { value: '1000000' } });
    expect(screen.getByRole('button', { name: 'Save limits' })).toBeEnabled();
    expect(calls.some(call => call.method === 'PUT')).toBe(false);
  });
  it('keeps the form open and shows the error when saving fails', async () => {
    stubApi({ 'PUT /budgets/personal/limits': () => json({ error: 'Conflicting update; reload and retry' }, 409) });
    render(<CategoryBudgets onOpenSimulator={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit limits' }));
    fireEvent.change(screen.getByLabelText('Dining limit'), { target: { value: '400' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save limits' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Conflicting update; reload and retry');
    expect(screen.getByLabelText('Dining limit')).toHaveValue('400');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save limits' })).toBeEnabled());
  });
});

describe('group budgets from the API', () => {
  it('lists the user\'s groups and shows balances', async () => {
    stubApi();
    render(<CategoryBudgets onOpenSimulator={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Group' }));
    expect(await screen.findByRole('heading', { name: 'Weekend Trip' })).toBeInTheDocument();
    expect(screen.getByText('3 members · Trip expenses')).toBeInTheDocument();
    expect(screen.getByText('of $900.00 shared plan · 12 days left')).toBeInTheDocument();
    expect(screen.getByText('Owes $38.20')).toBeInTheDocument();
    expect(screen.getByText('$38.20 left to settle')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Shared Apartment/ }));
    expect(screen.getByText('No shared plan set · 12 days left')).toBeInTheDocument();
    expect(screen.getByText('All settled up')).toBeInTheDocument();
  });
  it('shows who owes what', async () => {
    stubApi();
    render(<CategoryBudgets onOpenSimulator={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Group' }));
    fireEvent.click(await screen.findByRole('button', { name: /View who owes what/ }));
    expect(screen.getByText('$38.20 left to settle')).toBeInTheDocument();
    expect(screen.getByText('Payments to make')).toBeInTheDocument();
    expect(screen.getByText('$20.00')).toBeInTheDocument();
    expect(screen.getByText('$18.20')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mark/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Weekend Trip/ }));
    expect(screen.getByText('Shared expenses')).toBeInTheDocument();
  });
  it('lets an owner or admin edit the shared plan', async () => {
    const updated = groupsFixture().map(group => group.id === 'g1' ? { ...group, plannedCents: 100000 } : group);
    const calls = stubApi({ 'PUT /budgets/groups/g1/plan': () => json({ groups: updated }) });
    render(<CategoryBudgets onOpenSimulator={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Group' }));
    fireEvent.click(await screen.findByRole('button', { name: /Edit plan/ }));
    fireEvent.change(screen.getByLabelText('Shared plan'), { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save plan' }));
    expect(await screen.findByText('of $1,000.00 shared plan · 12 days left')).toBeInTheDocument();
    expect(calls.find(call => call.method === 'PUT')?.body).toEqual({ plannedCents: 100000 });
  });
  it('hides plan editing from plain members', async () => {
    stubApi();
    render(<CategoryBudgets onOpenSimulator={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Group' }));
    fireEvent.click(await screen.findByRole('tab', { name: /Shared Apartment/ }));
    expect(screen.queryByRole('button', { name: /Edit plan/ })).not.toBeInTheDocument();
  });
  it('explains when the user has no groups', async () => {
    stubApi({}, { groups: [] });
    render(<CategoryBudgets onOpenSimulator={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Group' }));
    expect(await screen.findByText(/not in any active groups/)).toBeInTheDocument();
  });
});
