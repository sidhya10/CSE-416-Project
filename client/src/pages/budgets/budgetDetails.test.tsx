import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import CategoryBudgets from './CategoryBudgets';
import { CATEGORY_BUDGETS, CATEGORY_TRANSACTIONS, categoryInsights } from './categoryPlan';
import { GROUP_BUDGETS, settlementsFor, totalOwedCents } from './groupBudgetPlan';

describe('budget fixtures', () => {
  it('category transactions sum to each category total', () => {
    for (const c of CATEGORY_BUDGETS) {
      expect(CATEGORY_TRANSACTIONS[c.key].reduce((s, t) => s + t.amountCents, 0)).toBe(c.spentCents);
    }
  });
  it('settlements add up to what each group is owed', () => {
    for (const g of GROUP_BUDGETS) {
      expect(settlementsFor(g).reduce((s, x) => s + x.cents, 0)).toBe(totalOwedCents(g));
    }
  });
  it('flags categories projected over plan', () => {
    const over = categoryInsights(CATEGORY_BUDGETS).filter(i => i.overPace).map(i => i.item.key);
    expect(over).toEqual(['dining', 'shopping']);
  });
});

describe('budget drill-downs', () => {
  it('opens a category from the plan and goes back', () => {
    render(<CategoryBudgets onOpenSimulator={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dining transactions' }));
    expect(screen.getByText('Thai Basil')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Budget/ }));
    expect(screen.getByText('Category plan')).toBeInTheDocument();
  });
  it('opens insights and drills into a category, returning to insights', () => {
    render(<CategoryBudgets onOpenSimulator={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /View insights/ }));
    expect(screen.getByText('Spending insights')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Shopping/ }));
    expect(screen.getByText('Amazon')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Budget/ }));
    expect(screen.getByText('Spending insights')).toBeInTheDocument();
  });
  it('shows who owes what for the group', () => {
    render(<CategoryBudgets onOpenSimulator={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Group' }));
    fireEvent.click(screen.getByRole('button', { name: /View who owes what/ }));
    expect(screen.getByText('$38.20 left to settle')).toBeInTheDocument();
    expect(screen.getByText('Payments to make')).toBeInTheDocument();
  });
});

describe('editable limits and settling', () => {
  it('saves new limits and reflects them on the plan', () => {
    render(<CategoryBudgets onOpenSimulator={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit limits' }));
    fireEvent.change(screen.getByLabelText('Dining limit'), { target: { value: '400' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save limits' }));
    expect(screen.getByText('$248.00 / $400.00')).toBeInTheDocument();
  });
  it('blocks saving an invalid limit', () => {
    render(<CategoryBudgets onOpenSimulator={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit limits' }));
    fireEvent.change(screen.getByLabelText('Dining limit'), { target: { value: 'abc' } });
    expect(screen.getByRole('button', { name: 'Save limits' })).toBeDisabled();
  });
  it('marking everything settled updates the group screen', () => {
    render(<CategoryBudgets onOpenSimulator={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Group' }));
    fireEvent.click(screen.getByRole('button', { name: /View who owes what/ }));
    for (const b of screen.getAllByRole('button', { name: /Mark settled/ })) fireEvent.click(b);
    expect(screen.getByText('All settled up')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Weekend Trip/ }));
    expect(screen.getByText('All settled up')).toBeInTheDocument();
    expect(screen.getByText('Paid $38.20')).toBeInTheDocument();
  });
});
