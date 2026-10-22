import { expect, test, type Page } from '@playwright/test';

// The provider is stubbed: never use Google passwords, live tokens or external accounts in CI.
// Browser tests exercise the actual popup/callback UI; server tests separately verify ID-token
// validation, browser-bound nonce/state, account linking and persisted password compatibility.
async function mockGoogle(page: Page) {
  const account = { id: 'google-flow-owner', name: 'Popup Owner', username: 'popupowner', email: 'owner@example.com', phone: null, birthday: '', bio: '', photoUrl: null, hasGoogle: false, hasPassword: true, createdAt: '2026-01-01' };
  let signedIn = false; let linked = false; let count = 0;
  const identity = () => ({ ...account, hasGoogle: linked });
  const requests: { path: string; body: Record<string, unknown> }[] = [];
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const body = route.request().postDataJSON() as Record<string, unknown> | null;
    requests.push({ path, body: body ?? {} });
    let status = 200; let data: unknown = {};
    if (path === '/api/auth/me') { status = signedIn ? 200 : 401; data = signedIn ? { user: identity() } : { error: 'Authentication required' }; }
    else if (path === '/api/auth/google/start') data = { clientId: 'popup-test.apps.googleusercontent.com', nonce: body?.nonce, state: String(++count).padStart(64, '0') };
    else if (path === '/api/auth/google' || path === '/api/auth/google/link') { signedIn = true; linked = true; data = { user: identity() }; }
    else if (path === '/api/auth/login') { signedIn = true; data = { user: identity() }; }
    else if (path === '/api/auth/logout') { signedIn = false; status = 204; }
    else if (path.endsWith('/friends')) data = { friends: [] };
    else if (path.endsWith('/groups')) data = { groups: [] };
    else if (path.includes('/budgets')) { status = 503; data = { error: 'No budget data in this auth fixture' }; }
    else { status = 404; data = { error: 'Not found' }; }
    await route.fulfill({ status, contentType: 'application/json', ...(status === 204 ? {} : { body: JSON.stringify(data) }) });
  });
  await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({ contentType: 'application/javascript', body: `
    let configuration;
    window.google = { accounts: { id: {
      initialize(options) { configuration = options; if (options.ux_mode !== 'popup') throw new Error('Expected popup'); },
      renderButton(element, options) {
        const button = document.createElement('button');
        button.textContent = options.text === 'signup_with' ? 'Sign up with Google' : 'Continue with Google';
        button.onclick = () => window.open('/google-test-popup?state=' + options.state, 'google-auth-popup', 'width=440,height=600');
        element.replaceChildren(button);
      },
      disableAutoSelect() {}
    } } };
    window.addEventListener('message', event => {
      if (event.origin === window.location.origin && event.data.testGoogleCredential) configuration.callback({ credential: 'provider-test-token', state: event.data.state });
    });
  ` }));
  await page.context().route('**/google-test-popup?*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body><h1>Google account chooser fixture</h1><button onclick="window.opener.postMessage({ testGoogleCredential: true, state: new URLSearchParams(location.search).get('state') }, location.origin); window.close();">Choose test account</button></body></html>` }));
  return { account, requests };
}
const clickGoogle = async (page: Page, label: string) => {
  const button = page.getByRole('button', { name: label, exact: true });
  await expect(button).toBeEnabled();
  const [chooser] = await Promise.all([page.waitForEvent('popup'), button.click()]);
  await expect(chooser.getByRole('heading', { name: 'Google account chooser fixture' })).toBeVisible();
  return chooser;
};

for (const signup of [false, true]) test(`Google ${signup ? 'sign-up' : 'sign-in'} opens a popup and completes its callback`, async ({ page }) => {
  const fixture = await mockGoogle(page);
  await page.goto('/');
  if (signup) {
    await page.getByRole('button', { name: 'Create an account' }).click();
    await page.getByRole('textbox', { name: 'PHONE NUMBER · REQUIRED' }).fill('+1 646 555 0101');
  }
  const popup = await clickGoogle(page, signup ? 'Sign up with Google' : 'Continue with Google');
  await popup.getByRole('button', { name: 'Choose test account' }).click();
  await expect(page.getByRole('button', { name: 'Profile', exact: true })).toBeVisible();
  expect(fixture.requests.some(r => r.path === '/api/auth/google' && r.body.credential === 'provider-test-token')).toBe(true);
});

test('profile connects Google to the password account and both entry points remain usable', async ({ page }) => {
  const fixture = await mockGoogle(page);
  await page.goto('/');
  await page.getByLabel('USERNAME, EMAIL, OR PHONE').fill(fixture.account.email);
  await page.getByLabel('PASSWORD', { exact: true }).fill('password1');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await page.getByRole('button', { name: /Account settings/ }).click();
  const popup = await clickGoogle(page, 'Continue with Google');
  await popup.getByRole('button', { name: 'Choose test account' }).click();
  await expect(page.getByText('Google account connected. You can sign in with Google or your existing password.')).toBeVisible();
  await expect(page.getByText('Password login enabled')).toBeVisible();
  await expect(page.getByText(fixture.account.email)).toBeVisible();
  expect(fixture.requests.some(r => r.path === '/api/auth/google/link')).toBe(true);
  await page.getByRole('button', { name: 'Back to Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  const loginPopup = await clickGoogle(page, 'Continue with Google');
  await loginPopup.getByRole('button', { name: 'Choose test account' }).click();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(page.getByText('Popup Owner')).toBeVisible();
});

test('closing the Google popup leaves email and password sign-in available', async ({ page }) => {
  const fixture = await mockGoogle(page);
  await page.goto('/');
  const popup = await clickGoogle(page, 'Continue with Google'); await popup.close();
  await expect(page.getByRole('button', { name: 'Continue with Google', exact: true })).toBeEnabled();
  await page.getByLabel('USERNAME, EMAIL, OR PHONE').fill(fixture.account.email);
  await page.getByLabel('PASSWORD', { exact: true }).fill('password1');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Profile', exact: true })).toBeVisible();
  expect(fixture.requests.some(r => r.path === '/api/auth/google')).toBe(false);
});
