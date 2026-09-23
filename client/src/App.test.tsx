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
    fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));
    const name = screen.getByRole('textbox', { name: 'NAME' });
    fireEvent.change(name, { target: { value: 'Test Person' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Vivian Zheng')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));
    fireEvent.change(screen.getByRole('textbox', { name: 'NAME' }), { target: { value: 'Test Person' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Test Person')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /account settings/i }));
    expect(screen.getByRole('heading', { name: 'Account settings' })).toBeInTheDocument();
    expect(screen.getAllByText('Available after account login')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Back to Settings' }));
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });
});
