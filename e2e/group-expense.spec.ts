import { expect, test } from '@playwright/test';

test('an expense persists across reload, edits in place, and updates the group overview', async ({ page }) => {
  const run = Date.now();
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByRole('textbox', { name: 'NAME', exact: true }).fill('Flow Owner');
  await page.getByRole('textbox', { name: 'USERNAME' }).fill(`flow_owner_${run}`);
  await page.getByRole('textbox', { name: 'EMAIL' }).fill(`flow-owner-${run}@example.com`);
  await page.getByLabel('PASSWORD').fill('password1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('button', { name: 'Groups' }).click();

  const companion = await page.request.post('/api/auth/register', { data: {
    name: 'Flow Friend', username: `flow_friend_${run}`, email: `flow-friend-${run}@example.com`, password: 'password1',
  } });
  const { user: companionUser } = await companion.json();
  await page.request.post('/api/auth/login', { data: { email: `flow-owner-${run}@example.com`, password: 'password1' } });
  await page.request.post(`/api/friends/${companionUser.id}`);
  await page.reload();
  await page.getByRole('button', { name: 'Groups', exact: true }).click();
  await page.getByRole('button', { name: /new group/i }).click();
  await expect(page.getByRole('heading', { name: 'SELECTED · 0' })).toBeVisible();
  await expect(page.getByRole('button', { name: /next: customize group/i })).toBeDisabled();
  await page.getByRole('button', { name: /Flow Friend.*@flow_friend/ }).click();
  await page.getByRole('button', { name: /next: customize group/i }).click();
  await page.getByRole('textbox', { name: 'GROUP NAME' }).fill('Project Team');
  await page.getByRole('button', { name: 'Create group' }).click();

  await page.getByRole('button', { name: '+ Add expense' }).click();
  await page.getByRole('textbox', { name: 'EXPENSE NAME' }).fill('Shared supplies');
  await page.getByRole('textbox', { name: 'Item 1 name' }).fill('Materials');
  await page.getByRole('textbox', { name: 'Item 1 amount' }).fill('30.00');
  await page.getByRole('button', { name: 'Continue to split' }).click();
  await page.getByRole('button', { name: 'Confirm and split $30.00' }).click();
  await page.getByRole('button', { name: 'Back to group' }).last().click();

  await expect(page.getByRole('heading', { name: 'Project Team' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Shared supplies.*30.00/ })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Groups', exact: true }).click();
  await page.getByRole('group', { name: 'Project Team' }).getByRole('button', { name: /Project Team.*members/ }).click();
  await page.getByRole('button', { name: /Shared supplies.*30.00/ }).click();
  await page.getByRole('button', { name: 'Edit expense' }).click();
  await page.getByRole('textbox', { name: 'Item 1 amount' }).fill('40.00');
  await page.getByRole('button', { name: /Review changes/ }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: 'Expense details' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to group', exact: true }).click();
  await expect(page.getByRole('button', { name: /Shared supplies.*40.00/ })).toHaveCount(1);
  await page.reload();
  await page.getByRole('button', { name: 'Groups', exact: true }).click();
  await page.getByRole('group', { name: 'Project Team' }).getByRole('button', { name: /Project Team.*members/ }).click();
  await expect(page.getByRole('button', { name: /Shared supplies.*40.00/ })).toHaveCount(1);
  await page.getByRole('button', { name: 'Back to Groups' }).click();

  const overview = page.getByLabel('Balance overview');
  await expect(overview.getByText('$20.00')).toHaveCount(1);
  await expect(overview.getByText('$0.00')).toHaveCount(1);
  await expect(page.getByRole('group', { name: 'Project Team' })).toContainText('Project Team');
});

test('item splits and two-sided payments persist for different signed-in members', async ({ browser }) => {
  const ownerContext = await browser.newContext({ baseURL: 'http://127.0.0.1:5173' });
  const memberContext = await browser.newContext({ baseURL: 'http://127.0.0.1:5173' });
  try {
    const run = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
    const register = async (context: typeof ownerContext, label: string) => {
      const response = await context.request.post('/api/auth/register', { data: { name: label, username: `${label.toLowerCase()}_${run}`, email: `${label}_${run}@example.com`, password: 'password1' } });
      expect(response.status()).toBe(201);
      return (await response.json()).user;
    };
    const owner = await register(ownerContext, 'Payer');
    const member = await register(memberContext, 'Debtor');
    const groupResponse = await ownerContext.request.post('/api/groups', { data: { name: `Dinner ${run}`, memberIds: [member.id] } });
    expect(groupResponse.status()).toBe(201);
    const group = (await groupResponse.json()).group;
    const payerPage = await ownerContext.newPage();
    const debtorPage = await memberContext.newPage();
    const openGroup = async (page: typeof payerPage) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Groups', exact: true }).click();
      await page.getByRole('group', { name: group.name }).getByRole('button', { name: new RegExp(`${group.name}.*members`) }).click();
    };
    await openGroup(payerPage);
    await payerPage.getByRole('button', { name: '+ Add expense' }).click();
    await payerPage.getByRole('textbox', { name: 'EXPENSE NAME' }).fill('Shared noodles');
    await payerPage.getByRole('textbox', { name: 'Item 1 name' }).fill('Noodles');
    await payerPage.getByRole('textbox', { name: 'Item 1 amount' }).fill('12.00');
    await payerPage.getByRole('button', { name: 'Continue to split' }).click();
    await payerPage.getByRole('button', { name: 'Split by item', exact: true }).click();
    // Items start unassigned. Select the members responsible for each item.
    for (const name of ['You for Noodles', 'Debtor for Noodles']) {
      const assignment = payerPage.getByRole('button', { name, exact: true });
      if (await assignment.getAttribute('aria-pressed') !== 'true') await assignment.click();
      await expect(assignment).toHaveAttribute('aria-pressed', 'true');
    }
    await expect(payerPage.getByRole('button', { name: 'Confirm and split $12.00' })).toBeEnabled();
    await payerPage.getByRole('button', { name: 'Confirm and split $12.00' }).click();
    await payerPage.getByRole('button', { name: 'Back to group' }).last().click();
    await openGroup(debtorPage);
    await debtorPage.getByRole('button', { name: /Shared noodles.*12.00/ }).click();
    await expect(debtorPage.getByRole('button', { name: 'Edit expense' })).toBeDisabled();
    await debtorPage.getByRole('button', { name: 'Payments', exact: true }).click();
    await debtorPage.getByRole('button', { name: 'Confirm payment' }).click();
    await expect(debtorPage.getByText('Payer will confirm when your payment arrives. Your balance stays open until then.')).toBeVisible();
    await openGroup(payerPage);
    await payerPage.getByRole('button', { name: /Shared noodles.*12.00/ }).click();
    await expect(payerPage.getByRole('button', { name: 'Edit expense' })).toBeDisabled();
    await payerPage.getByRole('button', { name: 'Payments', exact: true }).click();
    await payerPage.getByRole('button', { name: /Confirm receipt/ }).click();
    await expect(payerPage.getByText('Settled', { exact: true })).toBeVisible();
    await openGroup(debtorPage);
    await debtorPage.getByRole('button', { name: /Shared noodles.*12.00/ }).click();
    await debtorPage.getByRole('button', { name: 'Payments', exact: true }).click();
    await expect(debtorPage.getByText('Payer confirmed receipt. You have $0.00 left to pay for this expense.')).toBeVisible();
    const balances = await ownerContext.request.get(`/api/groups/${group.id}/balances`);
    expect((await balances.json()).balances).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: owner.id, balanceCents: 0, spendingCents: 600 }),
      expect.objectContaining({ userId: member.id, balanceCents: 0, spendingCents: 600 }),
    ]));
  } finally {
    // Playwright may already have closed contexts after a timeout.
    // Cleanup should never hide the assertion or action that actually failed.
    await Promise.allSettled([ownerContext.close(), memberContext.close()]);
  }
});

test('recurring plans affect future expenses, deletion retains history, and settled groups archive and delete for everyone', async ({ browser }) => {
  const ownerContext = await browser.newContext({ baseURL: 'http://127.0.0.1:5173' });
  const memberContext = await browser.newContext({ baseURL: 'http://127.0.0.1:5173' });
  try {
    const run = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
    const createUser = async (context: typeof ownerContext, label: string) => {
      const response = await context.request.post('/api/auth/register', { data: { name: label, username: `${label.slice(-6)}_${run}`, email: `${label}_${run}@example.com`, password: 'password1' } });
      expect(response.status()).toBe(201); return (await response.json()).user;
    };
    const owner = await createUser(ownerContext, 'scheduleowner');
    const member = await createUser(memberContext, 'schedulemember');
    const created = await ownerContext.request.post('/api/groups', { data: { name: `Recurring home ${run}`, type: 'Recurring', memberIds: [member.id] } });
    expect(created.status()).toBe(201); const group = (await created.json()).group;
    const payerPage = await ownerContext.newPage(), memberPage = await memberContext.newPage();
    await payerPage.goto('/'); await payerPage.getByRole('button', { name: 'Groups', exact: true }).click();
    await payerPage.getByRole('group', { name: group.name }).getByRole('button', { name: new RegExp(`${group.name}.*members`) }).click();
    await payerPage.getByRole('button', { name: '+ Add recurring' }).click();
    await payerPage.getByLabel('Name', { exact: true }).fill('Utilities');
    await payerPage.getByLabel('Amount per cycle').fill('12');
    await payerPage.getByLabel('Recurring from').fill(new Date().toISOString().slice(0, 10));
    await payerPage.getByRole('button', { name: 'Save recurring cost' }).click();
    await expect(payerPage.getByRole('button', { name: /Utilities.*View payments/ })).toBeVisible();
    const expenses = await ownerContext.request.get(`/api/groups/${group.id}/expenses`);
    expect((await expenses.json()).expenses).toHaveLength(1);
    await payerPage.getByRole('button', { name: /Utilities.*Monthly/ }).click();
    await payerPage.getByLabel('You', { exact: true }).fill('4');
    await payerPage.getByLabel('schedulemember', { exact: true }).fill('8');
    await payerPage.getByRole('button', { name: 'Save payment plan' }).click();
    await expect(payerPage.getByText('Payment plan saved for the next and future expenses.')).toBeVisible();
    const balances = await ownerContext.request.get(`/api/groups/${group.id}/balances`);
    expect((await balances.json()).balances).toEqual(expect.arrayContaining([expect.objectContaining({ userId: owner.id, balanceCents: 600 })]));
    await memberPage.goto('/'); await memberPage.getByRole('button', { name: 'Groups', exact: true }).click();
    await expect(memberPage.getByRole('group', { name: group.name })).toBeVisible();
    await payerPage.getByRole('button', { name: 'Delete recurring expense' }).click();
    await expect(payerPage.getByRole('dialog')).toContainText('Past expenses and their payments will remain unchanged');
    await payerPage.getByRole('button', { name: 'Cancel', exact: true }).click();
    await payerPage.getByRole('button', { name: 'Delete recurring expense' }).click();
    await payerPage.getByRole('button', { name: 'Delete permanently', exact: true }).click();
    await expect(payerPage.getByRole('heading', { name: 'Past expenses' })).toBeVisible();
    await expect(payerPage.getByRole('button', { name: /Utilities.*Monthly/ })).toHaveCount(0);
    await expect(payerPage.getByRole('button', { name: /Utilities.*View payments/ })).toBeVisible();
    await payerPage.getByRole('button', { name: 'Group settings' }).click();
    await expect(payerPage.getByRole('button', { name: 'Archive group' })).toBeDisabled();
    const savedExpenses = (await (await ownerContext.request.get(`/api/groups/${group.id}/expenses`)).json()).expenses;
    const sent = await memberContext.request.post(`/api/expenses/${savedExpenses[0].id}/payments`, { data: { amountCents: 600, clientRequestId: crypto.randomUUID() } });
    expect(sent.status()).toBe(201);
    const payment = (await sent.json()).payment;
    expect((await ownerContext.request.patch(`/api/expenses/${savedExpenses[0].id}/payments/${payment.id}`, { data: { status: 'CONFIRMED' } })).status()).toBe(200);
    await payerPage.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(payerPage.getByRole('button', { name: 'Archive group' })).toBeEnabled();
    await payerPage.getByRole('button', { name: 'Archive group' }).click();
    await expect(payerPage.getByRole('heading', { name: 'Archived groups' })).toBeVisible();
    await memberPage.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(memberPage.getByRole('group', { name: group.name })).toHaveCount(0);
    await memberPage.getByRole('button', { name: 'Archived groups (1)' }).click();
    await memberPage.getByRole('button', { name: `Restore ${group.name}` }).click();
    await memberPage.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(memberPage.getByRole('group', { name: group.name })).toBeVisible();
    await payerPage.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await payerPage.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(payerPage.getByRole('group', { name: group.name })).toBeVisible();
    const restoredExpenses = await memberContext.request.get(`/api/groups/${group.id}/expenses`);
    expect((await restoredExpenses.json()).expenses).toHaveLength(1);
    await payerPage.getByRole('group', { name: group.name }).getByRole('button', { name: 'Group actions' }).click();
    await payerPage.getByRole('group', { name: group.name }).getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(payerPage.getByRole('dialog')).toContainText('cannot be recovered');
    await payerPage.getByRole('button', { name: 'Delete permanently', exact: true }).click();
    await expect(payerPage.getByRole('group', { name: group.name })).toHaveCount(0);
    await memberPage.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(memberPage.getByRole('group', { name: group.name })).toHaveCount(0);
    expect((await ownerContext.request.get(`/api/groups/${group.id}`)).status()).toBe(404);

  } finally { await Promise.allSettled([ownerContext.close(), memberContext.close()]); }
});

test('appearance persists and password changes work through settings and a new login', async ({ page }) => {
  const run = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const email = `settings-${run}@example.com`;
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByRole('textbox', { name: 'NAME', exact: true }).fill('Settings User');
  await page.getByRole('textbox', { name: 'USERNAME' }).fill(`settings_${run}`.slice(0, 30));
  await page.getByRole('textbox', { name: 'EMAIL' }).fill(email);
  await page.getByLabel('PASSWORD').fill('original1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await page.getByRole('button', { name: /Appearance/ }).click();
  await page.getByLabel('Dark', { exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await page.getByRole('button', { name: /Appearance/ }).click();
  await expect(page.getByLabel('Dark', { exact: true })).toBeChecked();
  await page.getByLabel('Light', { exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Back to Settings', exact: true }).click();
  await page.getByRole('button', { name: /Account settings/ }).click();
  await page.getByRole('button', { name: /^Password / }).click();
  await page.getByLabel('Current password', { exact: true }).fill('original1');
  await page.getByLabel('New password', { exact: true }).fill('replacement2');
  await page.getByLabel('Confirm new password', { exact: true }).fill('replacement2');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByText('Password changed successfully.')).toBeVisible();
  await page.getByRole('button', { name: 'Back to Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.getByRole('textbox', { name: 'EMAIL' }).fill(email);
  await page.getByLabel('PASSWORD', { exact: true }).fill('original1');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByText('Email or password is incorrect')).toBeVisible();
  await page.getByLabel('PASSWORD', { exact: true }).fill('replacement2');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Good (morning|afternoon|evening), Settings$/ })).toBeVisible();
});

test('mobile customization shows all members and Back then Cancel exits creation', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const run = Date.now().toString();
  const ownerEmail = `mobile-owner-${run}@example.com`;
  await page.request.post('/api/auth/register', { data: { name: 'Mobile Owner', username: `mob_owner_${run}`, email: ownerEmail, password: 'password1' } });
  const friendIds: string[] = [];
  for (let i = 0; i < 7; i++) {
    const response = await page.request.post('/api/auth/register', { data: { name: `Mobile Friend ${i}`, username: `mob_${i}_${run}`, email: `mobile-${i}-${run}@example.com`, password: 'password1' } });
    expect(response.status()).toBe(201); friendIds.push((await response.json()).user.id);
  }
  await page.request.post('/api/auth/login', { data: { email: ownerEmail, password: 'password1' } });
  for (const id of friendIds) expect((await page.request.post(`/api/friends/${id}`)).status()).toBe(201);
  await page.goto('/');
  await page.getByRole('button', { name: 'Groups', exact: true }).click();
  await page.getByRole('button', { name: /new group/i }).click();
  for (let i = 0; i < 7; i++) await page.getByRole('button', { name: new RegExp(`Mobile Friend ${i}.*@mob_${i}_`) }).click();
  await page.getByRole('button', { name: /next: customize group/i }).click();
  await expect(page.getByText('MEMBERS · 8')).toBeVisible();
  const members = page.locator('.member-preview-card > div');
  await expect(members).toHaveCount(8);
  expect(await members.evaluateAll(rows => new Set(rows.map(row => Math.round(row.getBoundingClientRect().top))).size)).toBeGreaterThan(1);
  for (let i = 0; i < 7; i++) await expect(page.locator('.member-preview-card').getByText(`Mobile Friend ${i}`, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.locator('.member-preview-card').scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('customize-light.png') });
  await page.evaluate(() => { localStorage.setItem('cse416.appearance.v1', 'Dark'); window.dispatchEvent(new StorageEvent('storage', { key: 'cse416.appearance.v1' })); });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: test.info().outputPath('customize-dark.png') });

  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Groups', exact: true })).toBeVisible();
});
