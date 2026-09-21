import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import App from './App';

describe('App', () => {
  it('renders the application foundation status', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /budgeting app foundation is ready/i })).toBeInTheDocument();
  });
});
