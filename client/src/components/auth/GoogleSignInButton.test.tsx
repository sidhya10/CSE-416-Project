import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GoogleSignInButton from './GoogleSignInButton';
import { type GoogleCredential, type GoogleIdClient } from './googleIdentity';
import ProfileSettings from '../../pages/settings/ProfileSettings';
import type { AppUser } from '../../api/types';
import App from '../../App';
const account: AppUser = { id: 'owner', name: 'Owner', username: 'owner', email: 'owner@example.com', phone: null, birthday: '', bio: '', photoUrl: null, hasGoogle: false, hasPassword: true, createdAt: '2026-01-01' };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let callback: (credential: GoogleCredential) => void;
let startNumber: number;
let id: GoogleIdClient;
beforeEach(() => {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client');
  startNumber = 0;
  id = {
    initialize: vi.fn(options => { callback = options.callback; }),
    renderButton: vi.fn((element, options) => {
      const button = document.createElement('button');
      button.textContent = options.text === 'signup_with' ? 'Sign up with Google' : 'Continue with Google';
      button.onclick = () => callback({ credential: 'verified-google-token', state: options.state });
      element.replaceChildren(button);
    }),
  };
  vi.stubGlobal('google', { accounts: { id } });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/auth/google/start')) return response({ clientId: 'test-client', nonce: JSON.parse(String(init?.body)).nonce, state: String(++startNumber).padStart(64, '0') });
    if (url.endsWith('/auth/google/recover')) return response({ resetToken: 'google-recovery-token-1234567890123456' });
    if (url.endsWith('/auth/google') || url.endsWith('/auth/google/link')) return response({ user: { ...account, hasGoogle: true } });
    if (url.endsWith('/auth/me')) return response({ error: 'Not signed in' }, 401);
    if (url.endsWith('/auth/login')) return response({ user: account });
    if (url.endsWith('/friends')) return response({ friends: [] });
    if (url.endsWith('/groups')) return response({ groups: [] });
    return response({ error: 'Not found' }, 404);
  }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); document.querySelectorAll('script[data-google-identity]').forEach(script => script.remove()); });
const renderedGoogle = () => waitFor(() => expect(id.renderButton).toHaveBeenCalled());

describe('Google popup entry points', () => {
  it.each([false, true])('uses the popup button for sign-in and sign-up (signup=%s)', async signup => {
    const onSuccess = vi.fn();
    render(<GoogleSignInButton signup={signup} onSuccess={onSuccess} />);
    await renderedGoogle();
    expect(id.initialize).toHaveBeenCalledWith(expect.objectContaining({ ux_mode: 'popup', auto_select: false, use_fedcm_for_button: false }));
    fireEvent.click(screen.getByRole('button', { name: signup ? 'Sign up with Google' : 'Continue with Google' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ id: account.id, hasGoogle: true, hasPassword: true })));
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/google'), expect.objectContaining({ method: 'POST', body: JSON.stringify({ credential: 'verified-google-token', state: '1'.padStart(64, '0') }) }));
  });
  it('uses the public server client ID when the optional frontend setting is blank', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    render(<GoogleSignInButton onSuccess={() => {}} />);
    await renderedGoogle();
    expect(id.initialize).toHaveBeenCalledWith(expect.objectContaining({ client_id: 'test-client' }));
  });
  it('sizes the Google button to the available mobile width even while its host is hidden', async () => {
    render(<GoogleSignInButton onSuccess={() => {}} />);
    Object.defineProperty(screen.getByRole('region', { name: 'Continue with Google' }), 'clientWidth', { value: 272 });
    await renderedGoogle();
    expect(id.renderButton).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ width: 272 }));
  });
  it('connects Google from profile without signing out or changing the app account', async () => {
    const onUserChange = vi.fn(); const onLogout = vi.fn();
    render(<ProfileSettings user={account} onUserChange={onUserChange} onLogout={onLogout} onRootChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Account settings/ }));
    await renderedGoogle();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/google/start'), expect.objectContaining({ body: expect.stringContaining('"intent":"link"') }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    await waitFor(() => expect(onUserChange).toHaveBeenCalledWith(expect.objectContaining({ id: account.id, hasGoogle: true, hasPassword: true })));
    expect(onLogout).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/google/link'), expect.objectContaining({ method: 'POST' }));
  });
  it('returns a reset token only through the Google recovery flow', async () => {
    const onRecovery = vi.fn();
    render(<GoogleSignInButton intent="recover" onRecovery={onRecovery} />);
    await renderedGoogle();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/google/start'), expect.objectContaining({ body: expect.stringContaining('"intent":"recover"') }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    await waitFor(() => expect(onRecovery).toHaveBeenCalledWith('google-recovery-token-1234567890123456'));
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/google/recover'), expect.objectContaining({ method: 'POST' }));
  });
  it('shows the exact email mismatch returned when profile linking fails', async () => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation((input, init) => String(input).endsWith('/auth/google/link')
      ? Promise.resolve(response({ error: 'Email mismatch: this app account uses owner@example.com, but the selected Google account uses other@example.com. Choose the Google account with the same email.' }, 409))
      : original(input, init));
    render(<ProfileSettings user={account} onUserChange={() => {}} onLogout={() => {}} onRootChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Account settings/ }));
    await renderedGoogle();
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(await screen.findByText(/Email mismatch: this app account uses owner@example.com/)).toBeInTheDocument();
  });
  it('initializes once and ignores callbacks from a previous screen', async () => {
    const old = vi.fn(); const current = vi.fn();
    const view = render(<GoogleSignInButton onSuccess={old} />); await renderedGoogle();
    const first = vi.mocked(id.renderButton).mock.calls[0]![1].state;
    view.unmount();
    render(<GoogleSignInButton signup onSuccess={current} />);
    await waitFor(() => expect(id.renderButton).toHaveBeenCalledTimes(2));
    act(() => callback({ credential: 'stale', state: first }));
    expect(old).not.toHaveBeenCalled(); expect(current).not.toHaveBeenCalled();
    expect(id.initialize).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Sign up with Google' }));
    await waitFor(() => expect(current).toHaveBeenCalled());
  });
  it('shows a retryable configuration error and leaves password login usable', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'different-client');
    render(<App />);
    await screen.findByRole('heading', { name: 'Welcome back' });
    expect(await screen.findByText(/Google client IDs do not match/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('USERNAME, EMAIL, OR PHONE'), { target: { value: account.email } });
    fireEvent.change(screen.getByLabelText('PASSWORD'), { target: { value: 'password1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('button', { name: 'Profile' })).toBeInTheDocument();
  });
  it('prevents a second password submission while the Google token is being exchanged', async () => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    let finish!: (response: Response) => void;
    const exchange = new Promise<Response>(resolve => { finish = resolve; });
    vi.mocked(fetch).mockImplementation((input, init) => String(input).endsWith('/auth/google') ? exchange : original(input, init));
    render(<App />);
    await screen.findByRole('heading', { name: 'Welcome back' });
    await renderedGoogle();
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(screen.getByRole('button', { name: 'Log in' })).toBeDisabled();
    await act(async () => { finish(response({ error: 'Google token expired' }, 401)); });
    expect(await screen.findByText('Google token expired')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled();
  });
  it('shows SDK loading failures with retry instead of silently doing nothing', async () => {
    vi.stubGlobal('google', undefined);
    render(<GoogleSignInButton onSuccess={() => {}} />);
    await waitFor(() => expect(document.querySelector('script[data-google-identity]')).toBeInTheDocument());
    fireEvent.error(document.querySelector('script[data-google-identity]')!);
    expect(await screen.findByText(/Google could not load/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry Google sign-in' })).toBeEnabled();
    expect(document.querySelector('script[data-google-identity]')).not.toBeInTheDocument();
    vi.stubGlobal('google', { accounts: { id } });
    fireEvent.click(screen.getByRole('button', { name: 'Retry Google sign-in' }));
    await renderedGoogle();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
  });
});
