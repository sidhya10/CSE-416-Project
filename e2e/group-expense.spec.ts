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

  await page.getByRole('button', { name: /new group/i }).click();
  await expect(page.getByRole('heading', { name: 'SELECTED · 0' })).toBeVisible();
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
  await expect(page.getByText('$30.00')).toBeVisible();
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
  await expect(overview.getByText('$0.00')).toHaveCount(2);
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
    // Items initially include everyone. These buttons toggle assignments.
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
