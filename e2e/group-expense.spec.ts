import { expect, test } from '@playwright/test';

test('a new group expense updates its balance and the all-groups overview', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /explore app preview/i }).click();
  await page.getByRole('button', { name: 'Groups' }).click();

  await page.getByRole('button', { name: /new group/i }).click();
  await expect(page.getByRole('heading', { name: 'SELECTED · 0' })).toBeVisible();
  await page.getByRole('button', { name: /Alex.*@alex/i }).click();
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
  await expect(page.getByText('$15.00')).toBeVisible();
  await page.getByRole('button', { name: 'Back to Groups' }).click();

  const overview = page.getByLabel('Balance overview');
  await expect(overview.getByText('$79.80')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Project Team' }).getByText('You are owed $15.00')).toBeVisible();
});
