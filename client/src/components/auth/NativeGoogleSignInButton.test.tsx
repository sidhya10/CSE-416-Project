import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ signIn: vi.fn(), available: true }));
const api = vi.hoisted(() => ({ googleStart: vi.fn(), google: vi.fn(), linkGoogle: vi.fn(), recoverGoogle: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios', isPluginAvailable: () => native.available }, registerPlugin: () => ({ signIn: native.signIn }) }));
vi.mock('../../api/auth.api', () => ({ authApi: api }));
vi.mock('./googleIdentity', () => ({ loadGoogleIdentity: vi.fn(), prepareGoogle: vi.fn(), renderGoogleButton: vi.fn() }));
import GoogleSignInButton from './GoogleSignInButton';
import { loadGoogleIdentity } from './googleIdentity';
const account = { id: 'native-user' };
beforeEach(() => {
  vi.clearAllMocks(); native.available = true;
  api.googleStart.mockImplementation(async (nonce: string) => ({ clientId: 'web-client.apps.googleusercontent.com', nonce, state: 'bound-attempt-state' }));
  native.signIn.mockResolvedValue({ idToken: 'native-id-token' });
  api.google.mockResolvedValue({ user: account }); api.linkGoogle.mockResolvedValue({ user: account }); api.recoverGoogle.mockResolvedValue({ resetToken: 'reset-token' });
});
it.each(['signin', 'signup', 'link', 'recover'] as const)('uses native Google and the bound backend exchange for %s', async flow => {
  const onSuccess = vi.fn(), onRecovery = vi.fn();
  render(<GoogleSignInButton intent={flow === 'signup' ? 'signin' : flow} signup={flow === 'signup'} phone="+15555550123" onSuccess={onSuccess} onRecovery={onRecovery} />);
  expect(api.googleStart).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button'));
  await waitFor(() => expect(flow === 'recover' ? onRecovery : onSuccess).toHaveBeenCalled());
  const nonce = api.googleStart.mock.calls[0]![0];
  expect(nonce).toMatch(/^[A-Za-z0-9_-]{32,128}$/);
  expect(api.googleStart).toHaveBeenCalledWith(nonce, flow);
  expect(native.signIn).toHaveBeenCalledWith({ serverClientId: 'web-client.apps.googleusercontent.com', nonce });
  if (flow === 'recover') expect(api.recoverGoogle).toHaveBeenCalledWith('native-id-token', 'bound-attempt-state');
  else if (flow === 'link') expect(api.linkGoogle).toHaveBeenCalledWith('native-id-token', 'bound-attempt-state');
  else expect(api.google).toHaveBeenCalledWith('native-id-token', 'bound-attempt-state', flow === 'signup' ? '+15555550123' : undefined);
  expect(loadGoogleIdentity).not.toHaveBeenCalled();
});
it('keeps old TestFlight builds out of the unsupported web sign-in flow', () => {
  native.available = false;
  render(<GoogleSignInButton />);
  expect(screen.getByRole('button')).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('Update Divvy or sign in with a password');
  expect(api.googleStart).not.toHaveBeenCalled(); expect(loadGoogleIdentity).not.toHaveBeenCalled();
});
it('treats cancellation as cancellation and permits another attempt', async () => {
  native.signIn.mockRejectedValueOnce({ code: 'GOOGLE_CANCELLED' });
  const busy = vi.fn(); render(<GoogleSignInButton onBusyChange={busy} />);
  fireEvent.click(screen.getByRole('button'));
  await waitFor(() => expect(busy).toHaveBeenLastCalledWith(false));
  expect(screen.queryByRole('status')).toBeNull(); expect(api.google).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button')); await waitFor(() => expect(api.google).toHaveBeenCalledOnce());
  expect(api.googleStart).toHaveBeenCalledTimes(2);
  expect(api.googleStart.mock.calls[0]![0]).not.toBe(api.googleStart.mock.calls[1]![0]);
});
it('does not exchange an empty native credential', async () => {
  native.signIn.mockResolvedValue({ idToken: '' }); render(<GoogleSignInButton />);
  fireEvent.click(screen.getByRole('button'));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Google did not return'));
  expect(api.google).not.toHaveBeenCalled();
});
it('shows native configuration failures without falling back to a WebView popup', async () => {
  native.signIn.mockRejectedValue(new Error('Google sign-in is not configured for this iOS app yet. Sign in with a password.'));
  render(<GoogleSignInButton />); fireEvent.click(screen.getByRole('button'));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('not configured'));
  expect(api.google).not.toHaveBeenCalled(); expect(loadGoogleIdentity).not.toHaveBeenCalled();
});
it('ignores native completion after leaving the screen', async () => {
  let finish!: (value: { idToken: string }) => void;
  native.signIn.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const view = render(<GoogleSignInButton />); fireEvent.click(screen.getByRole('button'));
  await waitFor(() => expect(native.signIn).toHaveBeenCalled()); view.unmount();
  await act(async () => { finish({ idToken: 'late-token' }); });
  expect(api.google).not.toHaveBeenCalled();
});
