import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../../App';

function openExpense(group = 'Weekend Trip') {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /explore app preview/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Groups' }));
  fireEvent.click(screen.getByRole('button', { name: new RegExp(group) }));
  fireEvent.click(screen.getByRole('button', { name: '+ Add expense' }));
}
const fill = (label: string, value: string) => fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value } });

describe('Expense entry flow', () => {
  it('opens from a group, calculates the design example and preserves the draft through payer selection', () => {
    openExpense();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    fill('EXPENSE NAME', 'Dinner at Myers + Chang');
    fill('Item 1 name', 'Pad Thai'); fill('Item 1 amount', '18.50');
    fireEvent.click(screen.getByRole('button', { name: '+ Add item' }));
    fill('Item 2 name', 'Green Curry'); fill('Item 2 amount', '22.00');
    fireEvent.click(screen.getByRole('button', { name: '+ Add item' }));
    fill('Item 3 name', 'Spring Rolls'); fill('Item 3 amount', '12.00');
    fill('Tax', '12.00'); fill('Tip', '13.00');
    expect(screen.getByText('$52.50 subtotal')).toBeInTheDocument();
    expect(screen.getByText('$77.50')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Paid by you · Change' }));
    fireEvent.click(screen.getByRole('radio', { name: /Alex/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Use Alex as payer' }));
    expect(screen.getByRole('button', { name: 'Paid by Alex · Change' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'EXPENSE NAME' })).toHaveValue('Dinner at Myers + Chang');
    fireEvent.click(screen.getByRole('button', { name: 'Paid by Alex · Change' }));
    fireEvent.click(screen.getByRole('radio', { name: /Jordan/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to expense' }));
    expect(screen.getByRole('button', { name: 'Paid by Alex · Change' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to split' }));
    expect(screen.getByRole('heading', { name: 'Split expense' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to expense' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to group' }));
    expect(screen.getByRole('heading', { name: 'Weekend Trip' })).toBeInTheDocument();
  });

  it('validates empty entries, precision and negative fees, and restricts payers to group members', () => {
    openExpense('Shared Apartment');
    fireEvent.click(screen.getByRole('button', { name: 'Continue to split' }));
    expect(screen.getByRole('status')).toHaveTextContent('Enter an expense name');
    fill('EXPENSE NAME', 'Groceries'); fill('Item 1 name', 'Bread'); fill('Item 1 amount', '1.001');
    fireEvent.click(screen.getByRole('button', { name: 'Continue to split' }));
    expect(screen.getByRole('status')).toHaveTextContent('up to two decimal places');
    fill('Item 1 amount', '0.10'); fill('Tax', '-2');
    fireEvent.click(screen.getByRole('button', { name: 'Continue to split' }));
    expect(screen.getByRole('status')).toHaveTextContent('non-negative');
    fill('Tax', '0.20');
    expect(screen.getByText('$0.30')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Paid by you · Change' }));
    expect(within(screen.getByRole('radiogroup')).getAllByRole('radio')).toHaveLength(3);
    expect(screen.queryByRole('radio', { name: /Taylor/ })).not.toBeInTheDocument();
  });

  it('accepts a receipt locally and rejects unsupported files without replacing it', () => {
    openExpense();
    const input = document.querySelector('input[accept="image/*,application/pdf"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['receipt'], 'dinner.png', { type: 'image/png' })] } });
    expect(screen.getByText('dinner.png')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('automatic receipt reading is not connected');
    fireEvent.change(input, { target: { files: [new File(['bad'], 'bad.txt', { type: 'text/plain' })] } });
    expect(screen.getByRole('status')).toHaveTextContent('Choose an image or PDF');
    expect(screen.getByText('dinner.png')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove receipt' }));
    expect(screen.queryByText('dinner.png')).not.toBeInTheDocument();
  });
});

describe('Expense balance integration', () => {
  it('updates a newly created group and the all-groups balance after an expense is confirmed', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /explore app preview/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Groups' }));
    fireEvent.click(screen.getByRole('button', { name: /new group/i }));
    fireEvent.click(screen.getByRole('button', { name: /Alex.*@alex/i }));
    fireEvent.click(screen.getByRole('button', { name: /next: customize group/i }));
    fireEvent.change(screen.getByRole('textbox', { name: 'GROUP NAME' }), { target: { value: 'Project Team' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create group' }));

    fireEvent.click(screen.getByRole('button', { name: '+ Add expense' }));
    fill('EXPENSE NAME', 'Shared supplies');
    fill('Item 1 name', 'Materials');
    fill('Item 1 amount', '30.00');
    fireEvent.click(screen.getByRole('button', { name: 'Continue to split' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and split $30.00' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Back to group' })[1]!);

    expect(screen.getByRole('heading', { name: 'Project Team' })).toBeInTheDocument();
    expect(screen.getByText('$15.00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Groups' }));

    const overview = within(screen.getByLabelText('Balance overview'));
    expect(overview.getByText('$79.80')).toBeInTheDocument();
    const group = within(screen.getByRole('group', { name: 'Project Team' }));
    expect(group.getByText('You are owed $15.00')).toBeInTheDocument();
  });
});

describe('Split screens', () => {
  it('retains assignments across modes and entry edits, blocks unassigned items, and confirms locally', () => {
    openExpense();
    fill('EXPENSE NAME', 'Lunch'); fill('Item 1 name', 'Noodles'); fill('Item 1 amount', '10.01');
    fireEvent.click(screen.getByRole('button', { name: 'Continue to split' }));
    expect(screen.getByRole('button', { name: 'Equal split' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Split by item' }));
    for (const name of ['You', 'Alex', 'Jordan', 'Taylor']) fireEvent.click(screen.getByRole('button', { name: `${name} for Noodles` }));
    expect(screen.getByRole('button', { name: 'Confirm and split $10.01' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Assign every item');
    fireEvent.click(screen.getByRole('button', { name: 'Alex for Noodles' }));
    fireEvent.click(screen.getByRole('button', { name: 'Equal split' }));
    fireEvent.click(screen.getByRole('button', { name: 'Split by item' }));
    expect(screen.getByRole('button', { name: 'Alex for Noodles' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'You for Noodles' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Back to expense' }));
    expect(screen.getByRole('textbox', { name: 'EXPENSE NAME' })).toHaveValue('Lunch');
    fill('Item 1 amount', '12.00');
    fireEvent.click(screen.getByRole('button', { name: 'Continue to split' }));
    expect(screen.getByRole('button', { name: 'Alex for Noodles' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and split $12.00' }));
    expect(screen.getByRole('heading', { name: 'Split saved' })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Back to group' })[1]!);
    expect(screen.getByRole('heading', { name: 'Weekend Trip' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('group balances updated');
    const saved = within(screen.getByRole('region', { name: 'Current trip expenses' })).getByRole('button', { name: /Lunch/ });
    expect(saved).toHaveTextContent('$12.00');
    fireEvent.click(screen.getByRole('button', { name: 'Back to Groups' }));
    fireEvent.click(screen.getByRole('button', { name: /Weekend Trip/ }));
    expect(within(screen.getByRole('region', { name: 'Current trip expenses' })).getAllByRole('button', { name: /Lunch/ })).toHaveLength(1);
  });
});

it('assigns items by selected name and keeps both assignment methods synchronized', () => {
  openExpense();
  fill('EXPENSE NAME', 'Lunch'); fill('Item 1 name', 'Noodles'); fill('Item 1 amount', '12.00');
  fireEvent.click(screen.getByRole('button', { name: '+ Add item' }));
  fill('Item 2 name', 'Tea'); fill('Item 2 amount', '4.00');
  fireEvent.click(screen.getByRole('button', { name: 'Continue to split' }));
  fireEvent.click(screen.getByRole('button', { name: 'Split by item' }));
  const nicole = screen.getByRole('button', { name: 'Select Alex to assign items' });
  fireEvent.click(nicole);
  expect(nicole).toHaveAttribute('aria-pressed', 'true');
  const noodles = screen.getByRole('button', { name: 'Assign Noodles to Alex' });
  fireEvent.click(noodles);
  expect(noodles).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: 'Alex for Noodles' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: 'Alex for Tea' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Alex for Noodles' }));
  expect(noodles).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Jordan for Noodles' }));
  expect(noodles).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Jordan for Noodles' })).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Select Jordan to assign items' }));
  expect(nicole).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: 'Assign Noodles to Jordan' })).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Assign Noodles to Jordan' }));
  expect(screen.getByRole('button', { name: 'Jordan for Noodles' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Select Jordan to assign items' }));
  expect(screen.queryByRole('button', { name: 'Assign Noodles to Jordan' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Jordan for Noodles' })).toHaveAttribute('aria-pressed', 'true');
});

it('lists newest created expenses first and opens details for saved and sample expenses', () => {
  openExpense();
  const saveExpense = (name: string, amount: string) => {
    fill('EXPENSE NAME', name); fill('Item 1 name', 'Tickets'); fill('Item 1 amount', amount);
    fireEvent.click(screen.getByRole('button', { name: 'Continue to split' }));
    fireEvent.click(screen.getByRole('button', { name: `Confirm and split $${amount}` }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Back to group' })[1]!);
  };
  saveExpense('First outing', '20.00');
  fireEvent.click(screen.getByRole('button', { name: '+ Add expense' }));
  saveExpense('Second outing', '40.00');
  const list = within(screen.getByRole('region', { name: 'Current trip expenses' }));
  const rows = list.getAllByRole('button');
  expect(rows[0]).toHaveTextContent('Second outing');
  expect(rows[1]).toHaveTextContent('First outing');
  expect(rows[2]).toHaveTextContent('Lodging');
  fireEvent.click(rows[0]!);
  expect(screen.getByRole('heading', { name: 'Expense details' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Items and fees' })).toHaveTextContent('Tickets');
  expect(screen.getByRole('region', { name: 'Split shares' })).toHaveTextContent('$10.00');
  fireEvent.click(screen.getByRole('button', { name: 'Back to group' }));
  fireEvent.click(screen.getByRole('button', { name: /Lodging/ }));
  expect(screen.getByRole('heading', { name: 'Lodging' })).toBeInTheDocument();
  expect(screen.getByText(/Sample transaction · This is the amount/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Back to group' }));
  expect(within(screen.getByRole('region', { name: 'Current trip expenses' })).getAllByRole('button')[0]).toHaveTextContent('Second outing');
});

it('preserves individual fees and receipt metadata in expense details without inventing payment status', () => {
  openExpense();
  fill('EXPENSE NAME', 'Receipt dinner'); fill('Item 1 name', 'Meal'); fill('Item 1 amount', '20.00');
  fill('Tax', '2.00'); fill('Tip', '4.00'); fill('Other', '1.00');
  const input = document.querySelector('input[accept="image/*,application/pdf"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(['receipt'], 'meal.png', { type: 'image/png' })] } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue to split' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and split $27.00' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Back to group' })[1]!);
  fireEvent.click(screen.getByRole('button', { name: /Receipt dinner/ }));
  const items = within(screen.getByRole('region', { name: 'Items and fees' }));
  for (const amount of ['$20.00', '$2.00', '$4.00', '$1.00', '$27.00']) expect(items.getByText(amount)).toBeInTheDocument();
  expect(items.getByText(/meal.png/)).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Your payment' })).toHaveTextContent('You don’t owe a payment to yourself');
  expect(screen.queryByText(/Awaiting receipt/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Payments' }));
  expect(screen.getByRole('heading', { name: 'Payment status' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Collection summary' })).toHaveTextContent('$0.00 received');
  fireEvent.click(screen.getByRole('button', { name: 'Details' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit expense' }));
  expect(screen.getByRole('heading', { name: 'Edit expense' })).toBeInTheDocument();
});

it('edits an existing expense, preserves drafts through review, and saves without duplicating it', () => {
  openExpense();
  fill('EXPENSE NAME', 'Original dinner'); fill('Item 1 name', 'Meal'); fill('Item 1 amount', '20.00');
  fireEvent.click(screen.getByRole('button', { name: 'Continue to split' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and split $20.00' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Back to group' })[1]!);
  fireEvent.click(screen.getByRole('button', { name: /Original dinner/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit expense' }));
  fill('EXPENSE NAME', 'Discard me');
  fireEvent.click(screen.getByRole('button', { name: 'Back to details' }));
  expect(screen.getByRole('heading', { name: 'Original dinner' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Edit expense' }));
  expect(screen.getByRole('textbox', { name: 'EXPENSE NAME' })).toHaveValue('Original dinner');
  fill('EXPENSE NAME', 'Updated dinner'); fill('Item 1 amount', '24.00'); fill('Tax', '4.00');
  fireEvent.click(screen.getByRole('button', { name: 'Paid by you · Change' }));
  fireEvent.click(screen.getByRole('radio', { name: /Alex/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Use Alex as payer' }));
  fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Split by item' }));
  for (const name of ['You', 'Alex', 'Jordan', 'Taylor']) fireEvent.click(screen.getByRole('button', { name: `${name} for Meal` }));
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Select You to assign items' }));
  fireEvent.click(screen.getByRole('button', { name: 'Assign Meal to You' }));
  fireEvent.click(screen.getByRole('button', { name: 'Back to expense' }));
  expect(screen.getByRole('textbox', { name: 'Item 1 amount' })).toHaveValue('24.00');
  fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
  expect(screen.getByRole('button', { name: 'You for Meal' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(screen.getByRole('heading', { name: 'Updated dinner' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Your payment' })).toHaveTextContent('$28.00 share payable to Alex');
  fireEvent.click(screen.getByRole('button', { name: 'Back to group' }));
  const list = within(screen.getByRole('region', { name: 'Current trip expenses' }));
  expect(list.queryByRole('button', { name: /Original dinner/ })).not.toBeInTheDocument();
  expect(list.getAllByRole('button', { name: /Updated dinner/ })).toHaveLength(1);
  expect(list.getByRole('button', { name: /Updated dinner/ })).toHaveTextContent('$28.00');
});

it('keeps reported payments through details navigation and expense edits', () => {
  openExpense();
  fill('EXPENSE NAME', 'Shared dinner'); fill('Item 1 name', 'Meal'); fill('Item 1 amount', '40.00');
  fireEvent.click(screen.getByRole('button', { name: 'Paid by you · Change' }));
  fireEvent.click(screen.getByRole('radio', { name: /Alex/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Use Alex as payer' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue to split' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and split $40.00' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Back to group' })[1]!);
  fireEvent.click(screen.getByRole('button', { name: /Shared dinner/ }));
  fireEvent.click(screen.getByRole('button', { name: 'View' }));
  expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm payment' }));
  expect(screen.getByRole('region', { name: 'Your payment' })).toHaveTextContent('Awaiting receipt');
  fireEvent.click(screen.getByRole('button', { name: 'Back to group' }));
  fireEvent.click(screen.getByRole('button', { name: /Shared dinner/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit expense' }));
  fill('EXPENSE NAME', 'Renamed dinner');
  fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Payments' }));
  expect(screen.getByRole('region', { name: 'Your payment' })).toHaveTextContent('Awaiting receipt');
  expect(screen.queryByRole('button', { name: 'Confirm payment' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Details' }));
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
});

it('changes receipt quantities in add and edit flows without multiplying the unit price twice', () => {
  openExpense();
  fill('EXPENSE NAME', 'Repeated coffees'); fill('Item 1 name', 'Latte'); fill('Item 1 amount', '5.00');
  fill('Item 1 quantity', '3');
  expect(screen.getByText('$15.00 subtotal')).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Item 1 amount' })).toHaveValue('5.00');
  fireEvent.click(screen.getByRole('button', { name: 'Continue to split' }));
  expect(screen.getByText('Latte × 3')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and split $15.00' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Back to group' })[1]!);
  fireEvent.click(screen.getByRole('button', { name: /Repeated coffees/ }));
  expect(screen.getByRole('region', { name: 'Items and fees' })).toHaveTextContent('Latte × 3');
  fireEvent.click(screen.getByRole('button', { name: 'Edit expense' }));
  expect(screen.getByRole('textbox', { name: 'Item 1 amount' })).toHaveValue('5.00');
  expect(screen.getByText('$15.00 subtotal')).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Item 1 quantity' })).toHaveValue('3');
  fill('Item 1 quantity', '2');
  fill('Item 1 amount', '6.00');
  expect(screen.getByText('$12.00 subtotal')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(screen.getByRole('region', { name: 'Items and fees' })).toHaveTextContent('Latte × 2');
  expect(screen.getByRole('region', { name: 'Split shares' })).toHaveTextContent('$3.00');
});

it('validates editable quantities and allows removing the final item and adding another', () => {
  openExpense();
  fill('EXPENSE NAME', 'Groceries'); fill('Item 1 name', 'Apples'); fill('Item 1 amount', '2.50');
  for (const quantity of ['', '0', '-1', '1.5', '1000', 'abc']) {
    fill('Item 1 quantity', quantity);
    fireEvent.click(screen.getByRole('button', { name: 'Continue to split' }));
    expect(screen.getByRole('status')).toHaveTextContent('Enter a whole-number quantity from 1 to 999');
    expect(screen.getByText('$0.00 subtotal')).toBeInTheDocument();
  }
  fill('Item 1 quantity', '4');
  expect(screen.getByText('$10.00 subtotal')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Remove item 1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue to split' }));
  expect(screen.getByRole('status')).toHaveTextContent('Add at least one item.');
  fireEvent.click(screen.getByRole('button', { name: '+ Add item' }));
  expect(screen.getByRole('textbox', { name: 'Item 1 quantity' })).toHaveValue('1');
  fill('Item 1 name', 'Pears'); fill('Item 1 amount', '3.00');
  fireEvent.click(screen.getByRole('button', { name: 'Continue to split' }));
  expect(screen.getByRole('button', { name: 'Confirm and split $3.00' })).toBeInTheDocument();
});
