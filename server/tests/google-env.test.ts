import { afterEach, describe, expect, it, vi } from 'vitest';
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
describe('Google environment configuration', () => {
  it('uses the root VITE client ID as a backend fallback when GOOGLE_CLIENT_ID is blank', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'web-client.apps.googleusercontent.com');
    vi.resetModules();
    const { env } = await import('../src/config/env.js');
    expect(env.GOOGLE_CLIENT_ID).toBe('web-client.apps.googleusercontent.com');
  });
  it('prefers the explicitly configured backend client ID', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'backend-client.apps.googleusercontent.com');
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'other-client.apps.googleusercontent.com');
    vi.resetModules();
    const { env } = await import('../src/config/env.js');
    expect(env.GOOGLE_CLIENT_ID).toBe('backend-client.apps.googleusercontent.com');
  });
  it('allows email authentication to start when both Google variables are blank', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', ''); vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    vi.resetModules();
    const { env } = await import('../src/config/env.js');
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
  });
});
