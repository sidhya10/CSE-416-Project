import { Capacitor, registerPlugin } from '@capacitor/core';
import { authApi } from '../api/auth.api';
import { createRequestId } from '../utils/requestId';

const google = registerPlugin<{ signIn(input: { serverClientId: string; nonce: string }): Promise<{ idToken: string }> }>('DivvyGoogleSignIn');
export const isNativeGooglePlatform = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
export const nativeGoogleAvailable = () => Capacitor.isPluginAvailable('DivvyGoogleSignIn');
export const nativeGoogleCancelled = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === 'GOOGLE_CANCELLED';

export async function nativeGoogleCredential(intent: 'signin' | 'signup' | 'link' | 'recover') {
  if (!nativeGoogleAvailable()) throw new Error('Google sign-in is not available in this app version. Update Divvy or sign in with a password.');
  // Preparation and token exchange both run in this WebView, preserving the HttpOnly attempt cookie.
  const attempt = await authApi.googleStart(createRequestId(), intent);
  const { idToken } = await google.signIn({ serverClientId: attempt.clientId, nonce: attempt.nonce });
  if (!idToken) throw new Error('Google did not return a sign-in credential. Please try again.');
  return { credential: idToken, state: attempt.state };
}
