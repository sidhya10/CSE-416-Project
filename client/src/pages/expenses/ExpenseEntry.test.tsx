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
    expect(screen.getByRole('status')).toHaveTextContent('has not saved an expense or changed balances');
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
