import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../../App';

function openExpense(group = 'Boston weekend') {
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
    fireEvent.click(screen.getByRole('radio', { name: /Nicole/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Use Nicole as payer' }));
    expect(screen.getByRole('button', { name: 'Paid by Nicole · Change' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'EXPENSE NAME' })).toHaveValue('Dinner at Myers + Chang');
    fireEvent.click(screen.getByRole('button', { name: 'Paid by Nicole · Change' }));
    fireEvent.click(screen.getByRole('radio', { name: /Eva/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to expense' }));
    expect(screen.getByRole('button', { name: 'Paid by Nicole · Change' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to split' }));
    expect(screen.getByRole('heading', { name: 'Split expense' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to expense' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to group' }));
    expect(screen.getByRole('heading', { name: 'Boston weekend' })).toBeInTheDocument();
  });

  it('validates empty entries, precision and negative fees, and restricts payers to group members', () => {
    openExpense('Apartment 4B');
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
    expect(screen.queryByRole('radio', { name: /Sidhya/ })).not.toBeInTheDocument();
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

describe('Split screens', () => {
  it('retains assignments across modes and entry edits, blocks unassigned items, and confirms locally', () => {
    openExpense();
    fill('EXPENSE NAME', 'Lunch'); fill('Item 1 name', 'Noodles'); fill('Item 1 amount', '10.01');
    fireEvent.click(screen.getByRole('button', { name: 'Continue to split' }));
    expect(screen.getByRole('button', { name: 'Equal split' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Split by item' }));
    for (const name of ['Vivian', 'Nicole', 'Eva', 'Sidhya']) fireEvent.click(screen.getByRole('button', { name: `${name} for Noodles` }));
    expect(screen.getByRole('button', { name: 'Confirm and split $10.01' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Assign every item');
    fireEvent.click(screen.getByRole('button', { name: 'Nicole for Noodles' }));
    fireEvent.click(screen.getByRole('button', { name: 'Equal split' }));
    fireEvent.click(screen.getByRole('button', { name: 'Split by item' }));
    expect(screen.getByRole('button', { name: 'Nicole for Noodles' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Vivian for Noodles' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Back to expense' }));
    expect(screen.getByRole('textbox', { name: 'EXPENSE NAME' })).toHaveValue('Lunch');
    fill('Item 1 amount', '12.00');
    fireEvent.click(screen.getByRole('button', { name: 'Continue to split' }));
    expect(screen.getByRole('button', { name: 'Nicole for Noodles' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and split $12.00' }));
    expect(screen.getByRole('heading', { name: 'Split saved' })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Back to group' })[1]!);
    expect(screen.getByRole('heading', { name: 'Boston weekend' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('preview session only');
    const saved = within(screen.getByRole('region', { name: 'Current trip expenses' })).getByRole('button', { name: /Lunch/ });
    expect(saved).toHaveTextContent('$12.00');
    fireEvent.click(screen.getByRole('button', { name: 'Back to Groups' }));
    fireEvent.click(screen.getByRole('button', { name: /Boston weekend/ }));
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
  const nicole = screen.getByRole('button', { name: 'Select Nicole to assign items' });
  fireEvent.click(nicole);
  expect(nicole).toHaveAttribute('aria-pressed', 'true');
  const noodles = screen.getByRole('button', { name: 'Assign Noodles to Nicole' });
  fireEvent.click(noodles);
  expect(noodles).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: 'Nicole for Noodles' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: 'Nicole for Tea' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Nicole for Noodles' }));
  expect(noodles).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Eva for Noodles' }));
  expect(noodles).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Eva for Noodles' })).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Select Eva to assign items' }));
  expect(nicole).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: 'Assign Noodles to Eva' })).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Assign Noodles to Eva' }));
  expect(screen.getByRole('button', { name: 'Eva for Noodles' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Select Eva to assign items' }));
  expect(screen.queryByRole('button', { name: 'Assign Noodles to Eva' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Eva for Noodles' })).toHaveAttribute('aria-pressed', 'true');
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
  expect(rows[2]).toHaveTextContent('Airbnb');
  fireEvent.click(rows[0]!);
  expect(screen.getByRole('heading', { name: 'Expense details' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Items and fees' })).toHaveTextContent('Tickets');
  expect(screen.getByRole('region', { name: 'Split shares' })).toHaveTextContent('$10.00');
  fireEvent.click(screen.getByRole('button', { name: 'Back to group' }));
  fireEvent.click(screen.getByRole('button', { name: /Airbnb/ }));
  expect(screen.getByRole('heading', { name: 'Airbnb' })).toBeInTheDocument();
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
  expect(screen.getByRole('status')).toHaveTextContent('No payment has been recorded');
  fireEvent.click(screen.getByRole('button', { name: 'Edit expense' }));
  expect(screen.getByRole('status')).toHaveTextContent('Editing saved expenses is not connected');
});
