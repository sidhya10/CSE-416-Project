import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test('any member splits only the current period, reports how they paid, and receives confirmation and reminders', async ({ browser }) => {
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 375, height: 812 } })));
  try {
    const [ownerContext, memberContext, otherContext] = contexts;
    const run = Date.now().toString(), names = ['Alex', 'Jordan', 'Casey'];
    const users = [];
    for (const [i, context] of contexts.entries()) {
      const response = await context.request.post('/api/auth/register', { data: { name: names[i], username: `period_${i}_${run}`, email: `period-${i}-${run}@example.com`, phone: `+1316${String(Number(run.slice(-7)) + i).slice(-7).padStart(7, '0')}`, password: 'password1' } });
      expect(response.status()).toBe(201); users.push((await response.json()).user);
    }
    const groupResponse = await ownerContext!.request.post('/api/groups', { data: { name: 'Weekend costs', memberIds: users.slice(1).map(u => u.id) } });
    expect(groupResponse.status()).toBe(201); const group = (await groupResponse.json()).group;
    const add = async (title: string, cents: number) => {
      const response = await ownerContext!.request.post(`/api/groups/${group.id}/expenses`, { data: { clientRequestId: randomUUID(), expense: { title, expenseDate: new Date().toISOString().slice(0, 10), paidByUserId: users[0].id, participantIds: users.map(u => u.id), splitMode: 'EQUAL', items: [{ name: title, quantity: 1, unitPriceCents: cents, assignedUserIds: [] }], taxCents: 0, tipCents: 0, otherCents: 0 } } });
      expect(response.status()).toBe(201); return (await response.json()).expense;
    };
    const settle = async (expenseId: string, context: typeof memberContext, amountCents: number) => {
      const response = await context!.request.post(`/api/expenses/${expenseId}/payments`, { data: { amountCents, clientRequestId: randomUUID() } });
      expect(response.status()).toBe(201); const payment = (await response.json()).payment;
      expect((await ownerContext!.request.patch(`/api/expenses/${expenseId}/payments/${payment.id}`, { data: { status: 'CONFIRMED' } })).status()).toBe(200);
    };
    const past = await add('Old settled lunch', 3000);
    await settle(past.id, memberContext, 1000); await settle(past.id, otherContext, 1000);
    const current = await add('Current dinner', 9000); await settle(current.id, memberContext, 1000);
    const memberPage = await memberContext!.newPage(), ownerPage = await ownerContext!.newPage(), otherPage = await otherContext!.newPage();
    await memberPage.goto('/'); await memberPage.getByRole('button', { name: 'Groups', exact: true }).click();
    await memberPage.getByRole('button', { name: /Weekend costs.*members/ }).click();
    await expect(memberPage.getByRole('region', { name: 'Resolved transactions' }).getByText('Old settled lunch')).toBeVisible();
    const splitButton = memberPage.getByRole('button', { name: 'Split current expenses', exact: true }); await expect(splitButton).toBeEnabled(); await splitButton.click();
    await expect(memberPage.getByRole('region', { name: 'Outstanding repayments', exact: true }).getByText('$50.00', { exact: true })).toBeVisible();
    await expect(memberPage.locator('.settlement-review').getByText('Old settled lunch')).toHaveCount(0);
    await memberPage.getByRole('button', { name: 'Start split', exact: true }).click();
    await expect(memberPage.getByRole('heading', { name: 'Groups', exact: true })).toBeVisible();
    await memberPage.getByRole('button', { name: /Send Alex \$20.00/ }).click();
    const sendDialog = memberPage.getByRole('dialog', { name: 'Confirm money sent' });
    await sendDialog.getByLabel('How did you send it?').selectOption('Zelle');
    await memberPage.screenshot({ path: test.info().outputPath('payment-popup.png') });
    await sendDialog.getByRole('button', { name: 'I sent $20.00' }).click();
    await expect(sendDialog).toHaveCount(0);
    await expect(memberPage.getByRole('button', { name: /Waiting for Alex to confirm/ })).toBeVisible();
    await ownerPage.goto('/'); await ownerPage.getByRole('button', { name: 'Groups', exact: true }).click();
    await expect(ownerPage.getByRole('progressbar', { name: /Collection progress/ })).toHaveAttribute('aria-valuenow', '2000');
    await ownerPage.getByRole('button', { name: /Weekend costs · Collect/ }).click();
    const collection = ownerPage.getByRole('dialog', { name: 'Collection progress' });
    await expect(collection.getByText('$20.00 · Zelle')).toBeVisible();
    await ownerPage.screenshot({ path: test.info().outputPath('collection-popup.png') });
    await collection.getByRole('button', { name: 'Remind Casey' }).click();
    await expect(collection.getByRole('status')).toContainText('In-app reminder sent to Casey');
    await collection.getByRole('button', { name: 'Confirm received from Jordan' }).click();
    await expect(collection.getByRole('status')).toContainText('Receipt from Jordan confirmed');
    await collection.getByRole('button', { name: 'Close', exact: true }).click();
    await memberPage.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await memberPage.getByRole('button', { name: 'Home', exact: true }).click();
    await memberPage.getByRole('button', { name: /^Notifications/ }).click();
    await expect(memberPage.getByText('Alex confirmed receiving $20.00 for Weekend costs.')).toBeVisible();
    await memberPage.getByRole('button', { name: 'Back to Home' }).click();
    await memberPage.getByRole('button', { name: 'Groups', exact: true }).click();
    await otherPage.goto('/');
    await expect(otherPage.getByRole('region', { name: 'Your to-dos' })).toBeVisible();
    await expect(otherPage.getByRole('region', { name: 'Group payment notifications' })).toHaveCount(0);
    await otherPage.getByRole('button', { name: 'Groups', exact: true }).click();
    await otherPage.getByRole('button', { name: 'Home', exact: true }).click();
    await otherPage.getByRole('button', { name: /^Notifications/ }).click();
    await expect(otherPage.getByText('Alex reminded you to send $30.00 for Weekend costs.')).toBeVisible();
    await otherPage.getByRole('button', { name: 'Back to Home' }).click();
    await otherPage.getByRole('button', { name: 'Groups', exact: true }).click();
    await otherPage.getByRole('button', { name: /Send Alex \$30.00/ }).click();
    await otherPage.getByRole('dialog').getByLabel('How did you send it?').selectOption('Cash');
    await otherPage.getByRole('dialog').getByRole('button', { name: 'I sent $30.00' }).click();
    await expect(otherPage.getByRole('dialog')).toHaveCount(0);
    await ownerPage.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(ownerPage.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '5000');
    await ownerPage.getByRole('button', { name: /Weekend costs · Collect/ }).click();
    await ownerPage.getByRole('dialog').getByRole('button', { name: 'Confirm received from Casey' }).click();
    await expect(ownerPage.getByRole('dialog').getByText('Received and confirmed', { exact: true })).toHaveCount(2);
    await ownerPage.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await expect(ownerPage.getByRole('progressbar')).toHaveCount(0);
    await memberPage.getByRole('button', { name: /Weekend costs.*members/ }).click();
    await memberPage.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(memberPage.getByRole('region', { name: 'Resolved transactions' }).getByText('Current dinner')).toBeVisible();
    await expect(memberPage.getByRole('button', { name: 'Split current expenses', exact: true })).toBeDisabled();
    await add('New transaction', 1500);
    await memberPage.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(memberPage.getByRole('button', { name: 'Split current expenses', exact: true })).toBeEnabled();
    await memberPage.getByRole('button', { name: 'Split current expenses', exact: true }).click();
    await expect(memberPage.getByRole('region', { name: 'Outstanding repayments', exact: true }).getByText('$10.00', { exact: true })).toBeVisible();
    await expect(memberPage.locator('.settlement-review').getByText('Current dinner')).toHaveCount(0);
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

test('new splits merge into one group card and one payment covers several periods', async ({ browser }) => {
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 375, height: 812 } })));
  try {
    const [owner, member] = contexts;
    const users = [];
    for (const [i, context] of contexts.entries()) {
      const response = await context.request.post('/api/auth/register', { data: { name: ['Alex', 'Jordan'][i], username: `merge_${i}_${Date.now()}`, email: `merge-${i}-${randomUUID()}@example.com`, phone: `+1317${String(Date.now() + i).slice(-7)}`, password: 'password1' } });
      expect(response.status()).toBe(201); users.push((await response.json()).user);
    }
    const g = await owner!.request.post('/api/groups', { data: { name: 'Merged payment cards', memberIds: [users[1].id] } });
    const groupId = (await g.json()).group.id;
    const addPeriod = async (title: string, total: number, payer = users[0].id) => {
      const e = await owner!.request.post(`/api/groups/${groupId}/expenses`, { data: { clientRequestId: randomUUID(), expense: { title, expenseDate: new Date().toISOString().slice(0, 10), paidByUserId: payer, participantIds: users.map(u => u.id), splitMode: 'EQUAL', items: [{ name: title, quantity: 1, unitPriceCents: total, assignedUserIds: [] }], taxCents: 0, tipCents: 0, otherCents: 0 } } });
      expect(e.status()).toBe(201);
      const preview = await member!.request.get(`/api/groups/${groupId}/settlements/preview`); const p = await preview.json();
      expect((await member!.request.post(`/api/groups/${groupId}/settlements`, { data: { clientRequestId: randomUUID(), expenseIds: p.expenseIds, totalCents: p.totalCents } })).status()).toBe(201);
    };
    await addPeriod('First dinner', 2000); await addPeriod('Second dinner', 4000);
    await addPeriod('Jordan paid for taxi', 1000, users[1].id);
    const page = await member!.newPage(); await page.goto('/'); await page.getByRole('button', { name: 'Groups', exact: true }).click();
    const inbox = page.getByRole('region', { name: 'Group payment notifications' });
    await expect(inbox.getByRole('button', { name: /Send Alex \$30.00/ })).toHaveCount(1);
    await expect(inbox.getByRole('button', { name: /Collect \$5.00/ })).toHaveCount(1);
    await addPeriod('New coffee', 1000);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(inbox.getByRole('button', { name: /Send Alex \$35.00/ })).toHaveCount(1);
    await expect(inbox.getByRole('button', { name: /Send Alex/ })).toHaveCount(1);
    await inbox.getByRole('button', { name: /Send Alex/ }).click();
    await page.getByRole('dialog').getByLabel('How did you send it?').selectOption('Zelle');
    await page.getByRole('dialog').getByRole('button', { name: 'I sent $35.00' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(inbox.getByRole('button', { name: /Waiting for Alex to confirm/ })).toHaveCount(1);
    const recipient = await owner!.newPage(); await recipient.goto('/'); await recipient.getByRole('button', { name: 'Groups', exact: true }).click();
    const collections = recipient.getByRole('region', { name: 'Group payment notifications' });
    await expect(collections.getByRole('button', { name: /Collect \$35.00/ })).toHaveCount(1);
    await collections.getByRole('button', { name: /Collect \$35.00/ }).click();
    await expect(recipient.getByRole('button', { name: 'Confirm received from Jordan' })).toHaveCount(1);
    await recipient.getByRole('button', { name: 'Confirm received from Jordan' }).click();
    await expect(recipient.getByRole('status')).toContainText('Receipt from Jordan confirmed');
    await recipient.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(collections.getByRole('button', { name: /Collect/ })).toHaveCount(0);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(inbox.getByRole('button', { name: /Waiting for Alex/ })).toHaveCount(0);
    await expect(inbox.getByText('Alex confirmed receiving $35.00 for Merged payment cards.')).toHaveCount(0);
    await expect(inbox.getByRole('button', { name: /Collect \$5.00/ })).toHaveCount(1);
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Group payment notifications' })).toHaveCount(0);
    const todos = page.getByRole('region', { name: 'Your to-dos' });
    await expect(todos.getByText("You're owed $5.00 in 1 group")).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('home-todos.png') });
    await todos.getByRole('button', { name: 'View ›', exact: true }).click();
    const payments = page.getByRole('region', { name: 'Group payment notifications' });
    await expect(payments.getByRole('button', { name: /Collect \$5.00/ })).toHaveCount(1);
    const beforeGroups = await payments.evaluate(node => Boolean(node.compareDocumentPosition(document.querySelector('.group-section-title')!) & Node.DOCUMENT_POSITION_FOLLOWING));
    expect(beforeGroups).toBe(true);
    await page.screenshot({ path: test.info().outputPath('groups-payments.png') });
  } finally { await Promise.all(contexts.map(c => c.close())); }
});
