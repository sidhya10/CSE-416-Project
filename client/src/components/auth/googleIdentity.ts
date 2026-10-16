import { authApi } from '../../api/auth.api';
import { createRequestId } from '../../utils/requestId';

export type GoogleCredential = { credential: string; state?: string };
export type GoogleIdClient = {
  initialize: (options: { client_id: string; nonce: string; callback: (result: GoogleCredential) => void; ux_mode: 'popup'; auto_select: false; button_auto_select: false; use_fedcm_for_button: false }) => void;
  renderButton: (element: HTMLElement, options: { type: 'standard'; theme: 'outline' | 'filled_black'; size: 'large'; text: 'continue_with' | 'signup_with'; shape: 'pill'; width: number; state: string }) => void;
  disableAutoSelect?: () => void;
};
declare global { interface Window { google?: { accounts: { id: GoogleIdClient } }; } }
let loading: Promise<GoogleIdClient> | null = null;
let initialized: { id: GoogleIdClient; clientId: string } | null = null;
let nonce: string | null = null;
let startQueue: Promise<unknown> = Promise.resolve();
const handlers = new Map<string, (credential: string) => void>();
const pageNonce = () => nonce ??= createRequestId();

export function loadGoogleIdentity(): Promise<GoogleIdClient> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (loading) return loading;
  loading = new Promise<GoogleIdClient>((resolve, reject) => {
    const script = document.querySelector<HTMLScriptElement>('script[data-google-identity]') ?? document.createElement('script');
    const cleanup = () => { clearTimeout(timeout); script.removeEventListener('load', ready); script.removeEventListener('error', failed); };
    const ready = () => { cleanup(); if (window.google?.accounts?.id) resolve(window.google.accounts.id); else failed(); };
    const failed = () => { cleanup(); script.remove(); reject(new Error('Google could not load. Check your connection or browser blockers, then retry.')); };
    const timeout = window.setTimeout(failed, 15000);
    script.addEventListener('load', ready);
    script.addEventListener('error', failed);
    if (!script.isConnected) {
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.dataset.googleIdentity = 'true';
      document.head.appendChild(script);
    }
  }).catch(error => { loading = null; throw error; });
  return loading;
}

export async function prepareGoogle(intent: 'signin' | 'link') {
  // Serialize preparations so a superseded screen cannot overwrite a newer flow's cookie.
  const result = startQueue.catch(() => undefined).then(() => authApi.googleStart(pageNonce(), intent));
  startQueue = result;
  return result;
}

export function renderGoogleButton(id: GoogleIdClient, element: HTMLElement, input: {
  clientId: string; state: string; signup: boolean; dark: boolean; onCredential: (credential: string) => void;
}) {
  if (!initialized || initialized.id !== id) {
    id.initialize({ client_id: input.clientId, nonce: pageNonce(), ux_mode: 'popup', auto_select: false,
      button_auto_select: false, use_fedcm_for_button: false,
      callback: result => { if (result.state) handlers.get(result.state)?.(result.credential); } });
    initialized = { id, clientId: input.clientId };
  } else if (initialized.clientId !== input.clientId) throw new Error('Google client configuration changed. Reload the app.');
  handlers.set(input.state, input.onCredential);
  try { id.renderButton(element, { type: 'standard', theme: input.dark ? 'filled_black' : 'outline', size: 'large',
    text: input.signup ? 'signup_with' : 'continue_with', shape: 'pill', width: Math.max(200, Math.min(400, element.clientWidth || 320)), state: input.state }); } catch (error) { handlers.delete(input.state); throw error; }
  return () => { handlers.delete(input.state); element.replaceChildren(); };
}

export function disableGoogleAutoSelect() {
  try { window.google?.accounts?.id.disableAutoSelect?.(); } catch { /* Google availability must not prevent app logout. */ }
}
