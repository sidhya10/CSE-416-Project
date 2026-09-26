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
    expect(screen.getByRole('heading', { name: 'Good morning, Vivian' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Groups' }));
    expect(screen.getByRole('heading', { name: 'Groups' })).toBeInTheDocument();
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
    expect(screen.getByText('Vivian Zheng')).toBeInTheDocument();
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

  it('shows recurring schedules and updates a group description', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /explore app preview/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Groups' }));
    fireEvent.click(screen.getByRole('button', { name: /Apartment bills 3 members/i }));
    fireEvent.click(screen.getByRole('button', { name: /Rent Monthly/i }));
    expect(screen.getByRole('heading', { name: 'Rent' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Who pays this cycle?' }), { target: { value: 'nicole' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'You' }), { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save this cycle' }));
    expect(screen.getByRole('status')).toHaveTextContent('Shares must add up to $1,800');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Nicole Chen' }), { target: { value: '500' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Eva Lin' }), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save this cycle' }));
    expect(screen.getByRole('status')).toHaveTextContent('Payment plan saved for this cycle');
    fireEvent.click(screen.getByRole('button', { name: 'Next cycle' }));
    expect(screen.getByRole('combobox', { name: 'Who pays this cycle?' })).toHaveValue('you');
    fireEvent.click(screen.getByRole('button', { name: 'Previous cycle' }));
    expect(screen.getByRole('combobox', { name: 'Who pays this cycle?' })).toHaveValue('nicole');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Group settings' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'DESCRIPTION · VISIBLE TO MEMBERS' }),
      { target: { value: 'Rent and internet for our apartment' } });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Rent and internet for our apartment')).toBeInTheDocument();
  });

  it('adds a custom recurrence from a date and exposes split entry points', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /explore app preview/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Groups' }));
    fireEvent.click(screen.getByRole('button', { name: /Apartment 4B 3 members/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Split current expenses' }));
    expect(screen.getByRole('status')).toHaveTextContent('Split expense pages are coming soon');
    fireEvent.click(screen.getByRole('button', { name: 'Back to Groups' }));
    fireEvent.click(screen.getByRole('button', { name: /Apartment bills 3 members/i }));
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
    const group = within(screen.getByRole('group', { name: 'Boston weekend' }));
    fireEvent.click(group.getByRole('button', { name: 'Group actions' }));
    fireEvent.click(group.getByRole('button', { name: 'Archive' }));
    expect(screen.getByRole('heading', { name: 'Archived groups' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Boston weekend 4 members/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restore Boston weekend' }));
    fireEvent.click(screen.getByRole('button', { name: /Boston weekend 4 members/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Group settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete group' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Delete Boston weekend?');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('heading', { name: 'Group settings' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete group' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    expect(screen.getByRole('heading', { name: 'Groups' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Boston weekend 4 members/i })).not.toBeInTheDocument();
  });

  it('reveals swipe actions and confirms deletion from the group list', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /explore app preview/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Groups' }));
    const card = screen.getByRole('button', { name: /Apartment 4B 3 members/i });
    fireEvent(card, new MouseEvent('pointerdown', { bubbles: true, clientX: 260, clientY: 150 }));
    fireEvent(card, new MouseEvent('pointerup', { bubbles: true, clientX: 140, clientY: 150 }));
    const group = within(screen.getByRole('group', { name: 'Apartment 4B' }));
    expect(group.getByRole('button', { name: 'Group actions' })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(group.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    expect(screen.queryByRole('button', { name: /Apartment 4B 3 members/i })).not.toBeInTheDocument();
  });
});
