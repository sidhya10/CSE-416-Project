# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: google-auth.spec.ts >> Google sign-up opens a popup and completes its callback
- Location: e2e/google-auth.spec.ts:55:41

# Error details

```
Error: expect(locator).toBeEnabled() failed

Locator:  getByRole('button', { name: 'Sign up with Google', exact: true })
Expected: enabled
Received: disabled
Timeout:  5000ms

Call log:
  - Expect "toBeEnabled" getByRole('button', { name: 'Sign up with Google', exact: true }) with timeout 5000ms
  - waiting for getByRole('button', { name: 'Sign up with Google', exact: true })
    14 × locator resolved to <button disabled type="button" class="google-button">Sign up with Google</button>
       - unexpected value "disabled"

```

```yaml
- button "Sign up with Google" [disabled]
```

# Test source

```ts
  1  | import { expect, test, type Page } from '@playwright/test';
  2  | 
  3  | // The provider is stubbed: never use Google passwords, live tokens or external accounts in CI.
  4  | // Browser tests exercise the actual popup/callback UI; server tests separately verify ID-token
  5  | // validation, browser-bound nonce/state, account linking and persisted password compatibility.
  6  | async function mockGoogle(page: Page) {
  7  |   const account = { id: 'google-flow-owner', name: 'Popup Owner', username: 'popupowner', email: 'owner@example.com', phone: null, birthday: '', bio: '', photoUrl: null, hasGoogle: false, hasPassword: true, createdAt: '2026-01-01' };
  8  |   let signedIn = false; let linked = false; let count = 0;
  9  |   const identity = () => ({ ...account, hasGoogle: linked });
  10 |   const requests: { path: string; body: Record<string, unknown> }[] = [];
  11 |   await page.route(url => url.pathname.startsWith('/api/'), async route => {
  12 |     const url = new URL(route.request().url());
  13 |     const path = url.pathname;
  14 |     const body = route.request().postDataJSON() as Record<string, unknown> | null;
  15 |     requests.push({ path, body: body ?? {} });
  16 |     let status = 200; let data: unknown = {};
  17 |     if (path === '/api/auth/me') { status = signedIn ? 200 : 401; data = signedIn ? { user: identity() } : { error: 'Authentication required' }; }
  18 |     else if (path === '/api/auth/google/start') data = { clientId: 'popup-test.apps.googleusercontent.com', nonce: body?.nonce, state: String(++count).padStart(64, '0') };
  19 |     else if (path === '/api/auth/google' || path === '/api/auth/google/link') { signedIn = true; linked = true; data = { user: identity() }; }
  20 |     else if (path === '/api/auth/login') { signedIn = true; data = { user: identity() }; }
  21 |     else if (path === '/api/auth/logout') { signedIn = false; status = 204; }
  22 |     else if (path.endsWith('/friends')) data = { friends: [] };
  23 |     else if (path.endsWith('/groups')) data = { groups: [] };
  24 |     else if (path.includes('/budgets')) { status = 503; data = { error: 'No budget data in this auth fixture' }; }
  25 |     else { status = 404; data = { error: 'Not found' }; }
  26 |     await route.fulfill({ status, contentType: 'application/json', ...(status === 204 ? {} : { body: JSON.stringify(data) }) });
  27 |   });
  28 |   await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({ contentType: 'application/javascript', body: `
  29 |     let configuration;
  30 |     window.google = { accounts: { id: {
  31 |       initialize(options) { configuration = options; if (options.ux_mode !== 'popup') throw new Error('Expected popup'); },
  32 |       renderButton(element, options) {
  33 |         const button = document.createElement('button');
  34 |         button.textContent = options.text === 'signup_with' ? 'Sign up with Google' : 'Continue with Google';
  35 |         button.onclick = () => window.open('/google-test-popup?state=' + options.state, 'google-auth-popup', 'width=440,height=600');
  36 |         element.replaceChildren(button);
  37 |       },
  38 |       disableAutoSelect() {}
  39 |     } } };
  40 |     window.addEventListener('message', event => {
  41 |       if (event.origin === window.location.origin && event.data.testGoogleCredential) configuration.callback({ credential: 'provider-test-token', state: event.data.state });
  42 |     });
  43 |   ` }));
  44 |   await page.context().route('**/google-test-popup?*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body><h1>Google account chooser fixture</h1><button onclick="window.opener.postMessage({ testGoogleCredential: true, state: new URLSearchParams(location.search).get('state') }, location.origin); window.close();">Choose test account</button></body></html>` }));
  45 |   return { account, requests };
  46 | }
  47 | const clickGoogle = async (page: Page, label: string) => {
  48 |   const button = page.getByRole('button', { name: label, exact: true });
> 49 |   await expect(button).toBeEnabled();
     |                        ^ Error: expect(locator).toBeEnabled() failed
  50 |   const [chooser] = await Promise.all([page.waitForEvent('popup'), button.click()]);
  51 |   await expect(chooser.getByRole('heading', { name: 'Google account chooser fixture' })).toBeVisible();
  52 |   return chooser;
  53 | };
  54 | 
  55 | for (const signup of [false, true]) test(`Google ${signup ? 'sign-up' : 'sign-in'} opens a popup and completes its callback`, async ({ page }) => {
  56 |   const fixture = await mockGoogle(page);
  57 |   await page.goto('/');
  58 |   if (signup) await page.getByRole('button', { name: 'Create an account' }).click();
  59 |   const popup = await clickGoogle(page, signup ? 'Sign up with Google' : 'Continue with Google');
  60 |   await popup.getByRole('button', { name: 'Choose test account' }).click();
  61 |   await expect(page.getByRole('button', { name: 'Profile', exact: true })).toBeVisible();
  62 |   expect(fixture.requests.some(r => r.path === '/api/auth/google' && r.body.credential === 'provider-test-token')).toBe(true);
  63 | });
  64 | 
  65 | test('profile connects Google to the password account and both entry points remain usable', async ({ page }) => {
  66 |   const fixture = await mockGoogle(page);
  67 |   await page.goto('/');
  68 |   await page.getByLabel('EMAIL').fill(fixture.account.email);
  69 |   await page.getByLabel('PASSWORD', { exact: true }).fill('password1');
  70 |   await page.getByRole('button', { name: 'Log in', exact: true }).click();
  71 |   await page.getByRole('button', { name: 'Profile', exact: true }).click();
  72 |   await page.getByRole('button', { name: /Account settings/ }).click();
  73 |   const popup = await clickGoogle(page, 'Continue with Google');
  74 |   await popup.getByRole('button', { name: 'Choose test account' }).click();
  75 |   await expect(page.getByText('Google account connected. You can sign in with Google or your existing password.')).toBeVisible();
  76 |   await expect(page.getByText('Password login enabled')).toBeVisible();
  77 |   await expect(page.getByText(fixture.account.email)).toBeVisible();
  78 |   expect(fixture.requests.some(r => r.path === '/api/auth/google/link')).toBe(true);
  79 |   await page.getByRole('button', { name: 'Back to Settings', exact: true }).click();
  80 |   await page.getByRole('button', { name: 'Log out', exact: true }).click();
  81 |   const loginPopup = await clickGoogle(page, 'Continue with Google');
  82 |   await loginPopup.getByRole('button', { name: 'Choose test account' }).click();
  83 |   await page.getByRole('button', { name: 'Profile', exact: true }).click();
  84 |   await expect(page.getByText('Popup Owner')).toBeVisible();
  85 | });
  86 | 
  87 | test('closing the Google popup leaves email and password sign-in available', async ({ page }) => {
  88 |   const fixture = await mockGoogle(page);
  89 |   await page.goto('/');
  90 |   const popup = await clickGoogle(page, 'Continue with Google'); await popup.close();
  91 |   await expect(page.getByRole('button', { name: 'Continue with Google', exact: true })).toBeEnabled();
  92 |   await page.getByLabel('EMAIL').fill(fixture.account.email);
  93 |   await page.getByLabel('PASSWORD', { exact: true }).fill('password1');
  94 |   await page.getByRole('button', { name: 'Log in', exact: true }).click();
  95 |   await expect(page.getByRole('button', { name: 'Profile', exact: true })).toBeVisible();
  96 |   expect(fixture.requests.some(r => r.path === '/api/auth/google')).toBe(false);
  97 | });
  98 | 
```