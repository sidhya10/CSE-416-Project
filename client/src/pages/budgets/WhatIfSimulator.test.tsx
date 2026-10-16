import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ApiPersonalBudget, CategoryKey } from '../../api/budgets.api';
import WhatIfSimulator from './WhatIfSimulator';

const budget = (limits: Partial<Record<CategoryKey, [number, number]>>): ApiPersonalBudget => ({
  month: '2026-09', daysInMonth: 30, daysLeft: 12, hasBankConnection: true, lastSyncedAt: null,
  categories: (['dining', 'groceries', 'transit', 'shopping', 'other'] as const).map(key => ({ key, plannedCents: limits[key]?.[0] ?? 0, spentCents: limits[key]?.[1] ?? 0 })),
  transactions: { dining: [], groceries: [], transit: [], shopping: [], other: [] },
});
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

type Call = { method: string; url: string; body?: unknown };
function stubApi(personal: () => Response, onPut?: (body: unknown) => Response) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === 'GET' && url.endsWith('/budgets/personal')) return personal();
    if (method === 'PUT' && url.endsWith('/budgets/personal/limits') && onPut) return onPut(calls[calls.length - 1]!.body);
    throw new Error(`Unexpected request ${method} ${url}`);
  }));
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

const fixture = () => budget({ dining: [36500, 24800], shopping: [32500, 30100], transit: [20000, 9200] });

describe('What-if simulator', () => {
  it('reads limits and spending from the budget and shows projected results per category', async () => {
    stubApi(() => json(fixture()));
    render(<WhatIfSimulator />);
    expect(await screen.findByText('Projected results')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Dining: \$248\.00 spent, \$365\.00 projected, limit \$365\.00/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Transit: \$92\.00 spent, \$153\.33 projected/ })).toBeInTheDocument();
    expect(screen.getAllByText('Needs cuts')).toHaveLength(2);
    expect(screen.getByText('On track')).toBeInTheDocument();
    expect(screen.getByText('$46.67')).toBeInTheDocument();
    expect(screen.queryByText('Groceries')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply to budget' })).toBeDisabled();
  });

  it('updates the projection and a plain-language summary as a limit changes', async () => {
    stubApi(() => json(fixture()));
    render(<WhatIfSimulator />);
    fireEvent.change(await screen.findByLabelText(/Dining scenario limit/), { target: { value: '30000' } });
    expect(screen.getByText('$111.67')).toBeInTheDocument();
    expect(screen.getByText(/↑ \$65\.00 more than your current limits/)).toBeInTheDocument();
    expect(screen.getByText(/Holding to this Dining limit would save about \$65\.00 by the end of September/)).toBeInTheDocument();
    expect(screen.getByText('Saves $65.00 vs your current limit.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply to budget' })).toBeEnabled();
  });

  it('applies only the changed limits to the real budget and shows what the server returns', async () => {
    const calls = stubApi(() => json(fixture()), () => json(budget({ dining: [30000, 24800], shopping: [32500, 30100], transit: [20000, 9200] })));
    render(<WhatIfSimulator />);
    fireEvent.change(await screen.findByLabelText(/Dining scenario limit/), { target: { value: '30000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply to budget' }));
    expect(screen.getByText('Apply scenario')).toBeInTheDocument();
    expect(screen.getByText('Current $365.00 → Scenario $300.00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apply to budget' }));
    expect(await screen.findByText('Applied "Current changes" to your budget.')).toBeInTheDocument();
    expect(calls.find(call => call.method === 'PUT')?.body).toEqual({ limits: { dining: 30000 } });
    expect(screen.getByLabelText(/Dining scenario limit, currently \$300\.00/)).toBeInTheDocument();
  });

  it('keeps the apply screen and shows the error when saving fails', async () => {
    stubApi(() => json(fixture()), () => json({ error: 'Conflicting update' }, 409));
    render(<WhatIfSimulator />);
    fireEvent.change(await screen.findByLabelText(/Dining scenario limit/), { target: { value: '30000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply to budget' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply to budget' }));
    expect(await screen.findByText('Conflicting update')).toBeInTheDocument();
    expect(screen.getByText('Apply scenario')).toBeInTheDocument();
  });

  it('saves, compares and deletes scenarios within the session', async () => {
    stubApi(() => json(fixture()));
    render(<WhatIfSimulator />);
    fireEvent.change(await screen.findByLabelText(/Dining scenario limit/), { target: { value: '30000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save scenario' }));
    fireEvent.change(screen.getByLabelText('SCENARIO NAME'), { target: { value: 'Cut dining' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText(/Saved "Cut dining"/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Saved scenarios/ }));
    expect(screen.getByText('Projected left $111.67')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Cut dining' }));
    expect(screen.getByText('No saved scenarios yet. Create one to compare options side by side.')).toBeInTheDocument();
  });

  it('explains when no limits exist yet', async () => {
    stubApi(() => json(budget({ dining: [0, 5000] })));
    render(<WhatIfSimulator />);
    expect(await screen.findByText('No limits to simulate yet')).toBeInTheDocument();
  });

  it('shows a load error and recovers on retry', async () => {
    let fail = true;
    stubApi(() => fail ? json({ error: 'Authentication required' }, 401) : json(fixture()));
    render(<WhatIfSimulator />);
    expect(await screen.findByText('Authentication required')).toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByText('Projected results')).toBeInTheDocument());
  });

  it('does not fetch while hidden and reloads when opened', async () => {
    const calls = stubApi(() => json(fixture()));
    const { rerender } = render(<WhatIfSimulator active={false} />);
    expect(calls).toHaveLength(0);
    rerender(<WhatIfSimulator active />);
    expect(await screen.findByText('Projected results')).toBeInTheDocument();
    expect(calls.filter(call => call.method === 'GET')).toHaveLength(1);
  });
});
