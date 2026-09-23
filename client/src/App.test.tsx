import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import App from './App';

describe('App', () => {
  it('opens sign-in and navigates among empty preview destinations', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('heading', { name: 'Sign in to Together' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /explore app preview/i }));
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Groups' }));
    expect(screen.getByRole('heading', { name: 'Groups' })).toBeInTheDocument();
  });
});
