import { prisma } from '../../config/database.js';
import { personalBudget } from './budget.service.js';

// Keep dismissed/read alerts dismissed, even if spending continues to increase.
export async function refreshCategoryBudgetNotices(userId: string, now = new Date()) {
  const budget = await personalBudget(userId, now);
  const monthLabel = new Date(`${budget.month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const money = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const data = budget.categories.filter(c => c.plannedCents > 0 && c.spentCents > c.plannedCents).map(c => ({
    recipientId: userId, month: budget.month, category: c.key,
    message: `Your ${c.key[0]!.toUpperCase() + c.key.slice(1)} spending exceeded your ${monthLabel} budget: ${money(c.spentCents)} spent against a ${money(c.plannedCents)} limit (${money(c.spentCents - c.plannedCents)} over).`,
  }));
  if (data.length) await prisma.categoryBudgetNotice.createMany({ data, skipDuplicates: true });
}
