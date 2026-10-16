import { useEffect, useRef, useState } from 'react';
import { authApi } from '../../api/auth.api';
import { ApiError } from '../../api/client';
import type { AppUser } from '../../api/types';
import { loadGoogleIdentity, prepareGoogle, renderGoogleButton } from './googleIdentity';

export default function GoogleSignInButton({ intent = 'signin', signup = false, onSuccess, onBusyChange, disabled = false }: {
  intent?: 'signin' | 'link'; signup?: boolean; onSuccess: (user: AppUser) => void; onBusyChange?: (busy: boolean) => void; disabled?: boolean;
}) {
  const target = useRef<HTMLDivElement>(null);
  const onBusyChangeRef = useRef(onBusyChange);
  onBusyChangeRef.current = onBusyChange;
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const [message, setMessage] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attemptNumber, setAttemptNumber] = useState(0);
  const label = intent === 'link' ? 'Connect Google account' : signup ? 'Sign up with Google' : 'Continue with Google';
  useEffect(() => {
    if (disabled) return;
    let cancelled = false;
    let submitting = false;
    let dispose: (() => void) | undefined;
    let refresh: ReturnType<typeof setTimeout> | undefined;
    setMessage(''); setReady(false); setBusy(false);
    void (async () => {
      try {
        const attempt = await prepareGoogle(intent);
        if (cancelled) return;
        const configured = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
        if (configured && configured !== attempt.clientId) throw new Error('Google client IDs do not match. Set GOOGLE_CLIENT_ID and VITE_GOOGLE_CLIENT_ID to the same Web client ID, then restart.');
        const id = await loadGoogleIdentity();
        if (cancelled || !target.current) return;
        dispose = renderGoogleButton(id, target.current, { ...attempt, signup, dark: document.documentElement.dataset.theme === 'dark', onCredential: credential => {
          if (cancelled || submitting) return;
          submitting = true; setBusy(true); onBusyChangeRef.current?.(true); setMessage('');
          void (intent === 'link' ? authApi.linkGoogle(credential, attempt.state) : authApi.google(credential, attempt.state))
            .then(result => { if (!cancelled) onSuccessRef.current(result.user); })
            .catch(error => { if (!cancelled) setMessage(error instanceof ApiError ? error.message : 'Could not finish Google sign-in. Try again.'); })
            .finally(() => { if (!cancelled) { submitting = false; setBusy(false); onBusyChangeRef.current?.(false); } });
        } });
        setReady(true);
        refresh = setTimeout(() => setAttemptNumber(number => number + 1), 9 * 60 * 1000);
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : 'Could not prepare Google sign-in. Try again.');
      }
    })();
    return () => { cancelled = true; dispose?.(); clearTimeout(refresh); onBusyChangeRef.current?.(false); };
  }, [intent, signup, disabled, attemptNumber]);

  return <section className="google-auth-control" aria-label={label} aria-busy={busy}>
    {intent === 'link' && <p className="google-connect-label">Connect Google account</p>}
    <div ref={target} className="google-button-target" hidden={!ready || busy || disabled} />
    {(!ready || busy || disabled) && <button type="button" className="google-button" disabled>{busy ? 'Finishing Google sign-in…' : message || disabled ? label : 'Loading Google sign-in…'}</button>}
    {message && <><p className="form-notice" role="status">{message}</p><button type="button" className="google-retry" disabled={busy || disabled} onClick={() => setAttemptNumber(number => number + 1)}>Retry Google sign-in</button></>}
  </section>;
}
