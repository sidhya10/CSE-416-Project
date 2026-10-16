import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfileSettings from './ProfileSettings';
import { appearanceKey, useApplyAppearance } from '../../appearance';
import type { AppUser } from '../../api/types';
vi.mock('../../components/auth/GoogleSignInButton', () => ({ default: () => null }));
const user: AppUser = { id: 'owner', name: 'Owner', username: 'owner', email: 'owner@example.com', phone: null, birthday: '', bio: '', photoUrl: null, hasGoogle: false, hasPassword: true, createdAt: '2026-01-01' };
const renderSettings = (account = user) => render(<ProfileSettings user={account} onUserChange={() => {}} onLogout={() => {}} onRootChange={() => {}} />);
const openPassword = () => {
  fireEvent.click(screen.getByRole('button', { name: /Account settings/ }));
  fireEvent.click(screen.getByRole('button', { name: /^Password / }));
};
const enter = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
beforeEach(() => { localStorage.clear(); delete document.documentElement.dataset.theme; });

describe('password settings', () => {
  it('checks confirmation, shows server errors, saves and clears the password form', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Current password is incorrect' }), { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    renderSettings(); openPassword();
    enter('Current password', 'password1'); enter('New password', 'different2'); enter('Confirm new password', 'mismatch3');
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(screen.getByRole('status')).toHaveTextContent('New passwords do not match');
    expect(fetchMock).not.toHaveBeenCalled();
    enter('Confirm new password', 'different2');
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByText('Password changed successfully.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining('/auth/password'), expect.objectContaining({ method: 'POST', credentials: 'include', body: JSON.stringify({ currentPassword: 'password1', newPassword: 'different2', confirmPassword: 'different2' }) }));
    fireEvent.click(screen.getByRole('button', { name: /^Password / }));
    expect(screen.getByLabelText('Current password')).toHaveValue('');
    expect(screen.getByLabelText('New password')).toHaveValue('');
  });
  it('cancels without saving and clears secrets before reopening', () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    renderSettings(); openPassword();
    enter('Current password', 'password1');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: /^Password / }));
    expect(screen.getByLabelText('Current password')).toHaveValue('');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('explains password management for Google-only accounts', () => {
    renderSettings({ ...user, hasGoogle: true, hasPassword: false }); openPassword();
    expect(screen.getByText(/Manage your Google password/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
  });
});

function AppearanceHarness() { useApplyAppearance(); return <ProfileSettings user={user} onUserChange={() => {}} onLogout={() => {}} onRootChange={() => {}} />; }
describe('appearance', () => {
  it('applies and persists light/dark, restores on remount, and follows system changes only in System mode', async () => {
    let dark = true;
    const listeners = new Set<() => void>();
    vi.stubGlobal('matchMedia', vi.fn(() => ({ get matches() { return dark; }, addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) })));
    const view = render(<AppearanceHarness />);
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    fireEvent.click(screen.getByRole('button', { name: /Appearance/ }));
    fireEvent.click(screen.getByLabelText('Light'));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(localStorage.getItem(appearanceKey)).toBe('Light');
    dark = true; listeners.forEach(fn => fn());
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    fireEvent.click(screen.getByLabelText('Dark'));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    view.unmount();
    const reopened = render(<AppearanceHarness />);
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    fireEvent.click(screen.getByRole('button', { name: /Appearance/ }));
    expect(screen.getByLabelText('Dark')).toBeChecked();
    fireEvent.click(screen.getByLabelText('System'));
    dark = false; listeners.forEach(fn => fn());
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'light'));
    reopened.unmount(); expect(listeners.size).toBe(0);
  });
  it('ignores invalid stored preferences and synchronizes changes from another tab', async () => {
    localStorage.setItem(appearanceKey, 'invalid');
    render(<AppearanceHarness />);
    fireEvent.click(screen.getByRole('button', { name: /Appearance/ }));
    expect(screen.getByLabelText('System')).toBeChecked();
    localStorage.setItem(appearanceKey, 'Dark');
    fireEvent(window, new StorageEvent('storage', { key: appearanceKey }));
    await waitFor(() => expect(screen.getByLabelText('Dark')).toBeChecked());
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });
});
