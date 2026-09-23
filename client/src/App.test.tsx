import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import App from './App';

describe('App', () => {
  it('opens sign-in and navigates among empty preview destinations', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /explore app preview/i }));
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: /Apartment bills/i }));
    fireEvent.click(screen.getByRole('button', { name: /Rent Monthly/i }));
    expect(screen.getByRole('heading', { name: 'Rent' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Group settings' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'DESCRIPTION · VISIBLE TO MEMBERS' }),
      { target: { value: 'Rent and internet for our apartment' } });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Rent and internet for our apartment')).toBeInTheDocument();
  });
});
