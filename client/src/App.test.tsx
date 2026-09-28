import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import App from './App';

describe('App', () => {
  it('opens sign-in and navigates among empty preview destinations', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /explore app preview/i }));
    expect(screen.getByRole('heading', { name: 'Good morning, there' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Groups' }));
    expect(screen.getByRole('heading', { name: 'Groups' })).toBeInTheDocument();
  });

  it('shows visual totals and balance direction on each group picture', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /explore app preview/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Groups' }));

    const overview = within(screen.getByLabelText('Balance overview'));
    expect(overview.getByText('Owed to you')).toBeInTheDocument();
    expect(overview.getByText('$64.80')).toBeInTheDocument();
    expect(overview.getByText('You owe')).toBeInTheDocument();
    expect(overview.getByText('$38.20')).toBeInTheDocument();

    const boston = within(screen.getByRole('group', { name: 'Weekend Trip' }));
    expect(boston.getByText('You owe $38.20')).toBeInTheDocument();
    expect(boston.getByLabelText('Weekend Trip: you owe money')).toHaveClass('balance-owing');

    const apartment = within(screen.getByRole('group', { name: 'Shared Apartment' }));
    expect(apartment.getByText('You are owed $52.00')).toBeInTheDocument();
    expect(apartment.getByLabelText('Shared Apartment: you are owed money')).toHaveClass('balance-owed');
  });

  it('opens bank connections from the Profile account section', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /explore app preview/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Profile' }));
    fireEvent.click(screen.getByRole('button', { name: /bank connections/i }));

    expect(screen.getByRole('heading', { name: 'Connected accounts' })).toBeInTheDocument();
    expect(screen.getByText('Chase Total Checking')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /connect another account/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });

  it('edits a preview profile, discards canceled changes, and opens account settings', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /explore app preview/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Profile' }));
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^edit profile\s*›$/i }));
    const name = screen.getByRole('textbox', { name: 'NAME' });
    fireEvent.change(name, { target: { value: 'Test Person' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Demo User')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^edit profile\s*›$/i }));
    fireEvent.change(screen.getByRole('textbox', { name: 'NAME' }), { target: { value: 'Test Person' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Test Person')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /account settings/i }));
    expect(screen.getByRole('heading', { name: 'Account settings' })).toBeInTheDocument();
    expect(screen.getAllByText('Available after account login')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Back to Settings' }));
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });

  it('creates a trip group, keeps its budget private, and plans an estimate', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /explore app preview/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Groups' }));
    fireEvent.click(screen.getByRole('button', { name: /new group/i }));
    expect(screen.getByRole('heading', { name: 'SELECTED · 0' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Alex.*@alex/i }));
    fireEvent.click(screen.getByRole('button', { name: /Jordan.*@jordan/i }));
    fireEvent.click(screen.getByRole('button', { name: /Taylor.*@taylor/i }));
    fireEvent.click(screen.getByRole('button', { name: /next: customize group/i }));
    fireEvent.change(screen.getByRole('textbox', { name: 'GROUP NAME' }), { target: { value: 'Autumn trip' } });
    fireEvent.click(screen.getByRole('button', { name: 'Trip' }));
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '2026-10-10' } });
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '2026-10-13' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create group' }));
    expect(screen.getByRole('heading', { name: 'Autumn trip' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Private trip budget' }), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: /plan expense/i }));
    fireEvent.change(screen.getByRole('textbox', { name: 'EXPENSE NAME' }), { target: { value: 'Museum tickets' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'ESTIMATED TOTAL' }), { target: { value: '80' } });
    expect(screen.getByText(/\$280 of your private trip budget would remain/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save estimate' }));
    expect(screen.getByText('Museum tickets')).toBeInTheDocument();
  });

  it('updates a preset group description without relying on extra sample groups', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /explore app preview/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Groups' }));
    expect(screen.getAllByRole('group')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: /Shared Apartment 3 members/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Group settings' }));
    const description = screen.getByRole('textbox', { name: 'DESCRIPTION · VISIBLE TO MEMBERS' });
    fireEvent.change(description, { target: { value: 'Shared household expenses' } });
    expect(description).toHaveValue('Shared household expenses');
  });

  it('splits a running group total and adds a custom recurring expense', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /explore app preview/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Groups' }));
    fireEvent.click(screen.getByRole('button', { name: /Shared Apartment 3 members/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Split current expenses' }));
    expect(screen.getByRole('heading', { name: 'Split current total' })).toBeInTheDocument();
    expect(screen.getByText('$286.50')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /suggested split/i }));
    expect(screen.getByRole('heading', { name: 'Review split' })).toBeInTheDocument();
    expect(screen.getByText('Your share $95.50')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm split' }));
    expect(screen.getByRole('heading', { name: 'Current total split' })).toBeInTheDocument();
    expect(screen.getByText('$286.50 allocated')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to group' }));
    expect(screen.getByRole('status')).toHaveTextContent('Current total split saved');
    fireEvent.click(screen.getByRole('button', { name: 'Back to Groups' }));
    fireEvent.click(screen.getByRole('button', { name: /new group/i }));
    expect(screen.getByRole('heading', { name: 'SELECTED · 0' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Alex.*@alex/i }));
    fireEvent.click(screen.getByRole('button', { name: /next: customize group/i }));
    fireEvent.change(screen.getByRole('textbox', { name: 'GROUP NAME' }), { target: { value: 'Household Schedule' } });
    fireEvent.click(screen.getByRole('button', { name: 'Recurring' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create group' }));
    expect(screen.getByText('0 scheduled this month')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /add recurring/i }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Cleaning' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Amount per cycle' }), { target: { value: '90' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Repeat' }), { target: { value: 'Custom' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Every' }), { target: { value: '2' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Unit' }), { target: { value: 'weeks' } });
    fireEvent.change(screen.getByLabelText('Recurring from'), { target: { value: '2026-10-03' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save recurring cost' }));
    expect(screen.getByRole('heading', { name: 'Cleaning' })).toBeInTheDocument();
    expect(screen.getByText(/Every 2 weeks · starts Oct 3, 2026/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next cycle' }));
    expect(screen.getByText('Cycle of Oct 17, 2026')).toBeInTheDocument();
  });

  it('archives and restores a group through card actions, and confirms deletion from settings', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /explore app preview/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Groups' }));
    const group = within(screen.getByRole('group', { name: 'Weekend Trip' }));
    fireEvent.click(group.getByRole('button', { name: 'Group actions' }));
    fireEvent.click(group.getByRole('button', { name: 'Archive' }));
    expect(screen.getByRole('heading', { name: 'Archived groups' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Weekend Trip 4 members/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restore Weekend Trip' }));
    fireEvent.click(screen.getByRole('button', { name: /Weekend Trip 4 members/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Group settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete group' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Delete Weekend Trip?');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('heading', { name: 'Group settings' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete group' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    expect(screen.getByRole('heading', { name: 'Groups' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Weekend Trip 4 members/i })).not.toBeInTheDocument();
  });

  it('reveals swipe actions and confirms deletion from the group list', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /explore app preview/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Groups' }));
    const card = screen.getByRole('button', { name: /Shared Apartment 3 members/i });
    fireEvent(card, new MouseEvent('pointerdown', { bubbles: true, clientX: 260, clientY: 150 }));
    fireEvent(card, new MouseEvent('pointerup', { bubbles: true, clientX: 140, clientY: 150 }));
    const group = within(screen.getByRole('group', { name: 'Shared Apartment' }));
    expect(group.getByRole('button', { name: 'Group actions' })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(group.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    expect(screen.queryByRole('button', { name: /Shared Apartment 3 members/i })).not.toBeInTheDocument();
  });
  it('opens the what-if screens from Personal Budget and returns with navigation', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /explore app preview/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Budget' }));
    expect(screen.getByRole('heading', { name: 'Personal budget' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open what-if simulator' }));
    expect(screen.getByRole('heading', { name: 'What-if simulator' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Saved scenarios/ }));
    expect(screen.getByRole('heading', { name: 'Saved scenarios' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to what-if simulator' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Personal budget' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });

});
