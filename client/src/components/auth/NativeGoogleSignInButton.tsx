import { useEffect, useRef, useState } from 'react';
import { authApi } from '../../api/auth.api';
import { nativeGoogleAvailable, nativeGoogleCancelled, nativeGoogleCredential } from '../../native/googleSignIn';
import type { GoogleSignInProps } from './GoogleSignInButton';

export default function NativeGoogleSignInButton(props: GoogleSignInProps) {
  const current = useRef(props); current.current = props;
  const mounted = useRef(true), submitting = useRef(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; current.current.onBusyChange?.(false); }; }, []);
  const { intent = 'signin', signup = false, phone, disabled = false } = props;
  const available = nativeGoogleAvailable();
  const label = intent === 'link' ? 'Connect Google account' : intent === 'recover' ? 'Recover with Google' : signup ? 'Sign up with Google' : 'Continue with Google';
  const signIn = async () => {
    if (submitting.current || disabled || !available) return;
    submitting.current = true; setBusy(true); setMessage(''); current.current.onBusyChange?.(true);
    try {
      const { credential, state } = await nativeGoogleCredential(signup ? 'signup' : intent);
      if (!mounted.current) return;
      const result = intent === 'link' ? await authApi.linkGoogle(credential, state)
        : intent === 'recover' ? await authApi.recoverGoogle(credential, state)
          : await authApi.google(credential, state, signup ? phone : undefined);
      if (!mounted.current) return;
      if ('resetToken' in result) current.current.onRecovery?.(result.resetToken);
      else current.current.onSuccess?.(result.user);
    } catch (error) {
      if (mounted.current && !nativeGoogleCancelled(error)) setMessage(error instanceof Error ? error.message : 'Google sign-in could not finish. Please try again.');
    } finally {
      submitting.current = false;
      if (mounted.current) { setBusy(false); current.current.onBusyChange?.(false); }
    }
  };
  return <section className="google-auth-control" aria-label={label} aria-busy={busy}>
    <button type="button" className="google-button" disabled={busy || disabled || !available} onClick={() => { void signIn(); }}>
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.73-.06-1.42-.19-2.09H12v3.96h5.92a5.07 5.07 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-7.95Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.8l-3.56-2.76c-.98.66-2.24 1.06-3.72 1.06-2.87 0-5.3-1.94-6.17-4.54H2.15v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.83 13.96a6.6 6.6 0 0 1 0-3.92V7.2H2.15a11 11 0 0 0 0 9.6l3.68-2.84Z"/><path fill="#EA4335" d="M12 5.5c1.62 0 3.06.56 4.21 1.64l3.16-3.16A10.6 10.6 0 0 0 12 1a11 11 0 0 0-9.85 6.2l3.68 2.84C6.7 7.44 9.13 5.5 12 5.5Z"/></svg>
      {busy ? 'Finishing Google sign-in…' : label}
    </button>
    {!available && <p className="form-notice" role="status">Google sign-in is not available in this app version. Update Divvy or sign in with a password.</p>}
    {message && <p className="form-notice" role="status">{message}</p>}
  </section>;
}
