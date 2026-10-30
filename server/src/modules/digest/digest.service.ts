import { prisma } from '../../config/database.js';
import { CATEGORY_KEYS, monthWindow, type CategoryKey } from '../budgets/budget.categories.js';
import { groupBudgets, personalBudget } from '../budgets/budget.service.js';
import { planSchema } from '../recurring/recurring.service.js';
import { cycleDate } from '../recurring/schedule.js';

const DAY_MS = 86_400_000;
const isoDate = (value: Date) => value.toISOString().slice(0, 10);

// A category counts as "near its limit" from this share of the limit until it passes the limit.
export const NEAR_LIMIT_RATIO = 0.8;
export const CATEGORY_LABELS: Record<CategoryKey, string> = { dining: 'Dining', groceries: 'Groceries', transit: 'Transit', shopping: 'Shopping', other: 'Other' };

export type DigestAlert = { tone: 'attention' | 'over' | 'near'; title: string; detail?: string };
export type Digest = {
  firstName: string;
  /** The seven full UTC days the email covers, both ends inclusive, as YYYY-MM-DD. */
  period: { start: string; end: string };
  /** Attention items first, then categories over their limit, then categories near it. */
  alerts: DigestAlert[];
  /** Null when nothing was spent this week. `month` is null when the user has no category limits. */
  spending: null | {
    weekCents: number;
    topCategories: { key: CategoryKey; label: string; cents: number }[];
    month: null | { label: string; plannedCents: number; spentCents: number; daysLeft: number };
  };
  /** Group expenses dated in the period that include the user. Null when there were none. */
  splitting: null | { count: number; totalCents: number; paidCents: number; shareCents: number };
  /** Balances across all groups, and payments others have reported to the user. Null when all zero. */
  settling: null | { owedCents: number; owedGroups: number; oweCents: number; oweGroups: number; awaitingConfirmation: number };
  /** Recurring bills due in the next seven days, with the user's share. */
  comingUp: { title: string; date: string; shareCents: number }[];
};

/** Nothing worth sending: the weekly email is skipped for these users. */
export const isDigestEmpty = (digest: Digest) =>
  !digest.alerts.length && !digest.spending && !digest.splitting && !digest.settling && !digest.comingUp.length;

/** The seven full UTC days before today. Today is left out because its transactions are still arriving. */
export function weekWindow(now: Date) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end.getTime() - 7 * DAY_MS);
  return { start, end, startDate: isoDate(start), endDate: isoDate(new Date(end.getTime() - DAY_MS)) };
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

async function weekSpending(userId: string, now: Date, window: ReturnType<typeof weekWindow>) {
  const current = await personalBudget(userId, now);
  // A week that starts in the previous month needs that month's transactions too.
  const budgets = monthWindow(window.start).month === current.month ? [current] : [current, await personalBudget(userId, window.start)];
  const byCategory = Object.fromEntries(CATEGORY_KEYS.map(key => [key, 0])) as Record<CategoryKey, number>;
  for (const budget of budgets) {
    for (const key of CATEGORY_KEYS) {
      for (const transaction of budget.transactions[key]) {
        if (transaction.date >= window.startDate && transaction.date <= window.endDate) byCategory[key] += transaction.amountCents;
      }
    }
  }
  return { current, byCategory };
}

async function attentionAlerts(userId: string): Promise<DigestAlert[]> {
  const [brokenConnections, unreviewed] = await Promise.all([
    prisma.bankConnection.count({ where: { userId, status: 'NEEDS_ATTENTION' } }),
    prisma.bankTransaction.count({ where: { reviewedAt: null, excluded: false, account: { hidden: false, connection: { userId } } } }),
  ]);
  const pending = unreviewed ? `${plural(unreviewed, 'transaction')} pending review` : undefined;
  if (brokenConnections) {
    return [{ tone: 'attention', title: brokenConnections === 1 ? 'Bank connection needs re-authentication' : `${brokenConnections} bank connections need re-authentication`, ...(pending ? { detail: pending } : {}) }];
  }
  return unreviewed ? [{ tone: 'attention', title: `${plural(unreviewed, 'transaction')} to review` }] : [];
}

function limitAlerts(categories: { key: CategoryKey; plannedCents: number; spentCents: number }[]): DigestAlert[] {
  const money = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
  const limited = categories.filter(category => category.plannedCents > 0);
  const over = limited.filter(category => category.spentCents > category.plannedCents)
    .sort((a, b) => (b.spentCents - b.plannedCents) - (a.spentCents - a.plannedCents))
    .map((category): DigestAlert => ({ tone: 'over', title: `${CATEGORY_LABELS[category.key]} is over limit`, detail: `${money(category.spentCents)} of ${money(category.plannedCents)} budget used` }));
  const near = limited.filter(category => category.spentCents <= category.plannedCents && category.spentCents >= category.plannedCents * NEAR_LIMIT_RATIO)
    .sort((a, b) => b.spentCents / b.plannedCents - a.spentCents / a.plannedCents)
    .map((category): DigestAlert => ({ tone: 'near', title: `${CATEGORY_LABELS[category.key]} near limit`, detail: `${Math.round(category.spentCents / category.plannedCents * 100)}% of budget (${money(category.spentCents)} of ${money(category.plannedCents)})` }));
  return [...over, ...near];
}

async function splittingSummary(userId: string, window: ReturnType<typeof weekWindow>): Promise<Digest['splitting']> {
  const expenses = await prisma.expense.findMany({
    where: { expenseDate: { gte: window.start, lt: window.end }, shares: { some: { userId } } },
    select: { totalCents: true, paidByUserId: true, shares: { where: { userId }, select: { totalCents: true } } },
  });
  if (!expenses.length) return null;
  return {
    count: expenses.length,
    totalCents: expenses.reduce((sum, expense) => sum + expense.totalCents, 0),
    paidCents: expenses.filter(expense => expense.paidByUserId === userId).reduce((sum, expense) => sum + expense.totalCents, 0),
    shareCents: expenses.reduce((sum, expense) => sum + expense.shares.reduce((subtotal, share) => subtotal + share.totalCents, 0), 0),
  };
}

async function settlingSummary(userId: string, now: Date): Promise<Digest['settling']> {
  const [groups, awaitingConfirmation] = await Promise.all([
    groupBudgets(userId, now),
    // Payments others have reported sending to the user, in active groups, that the user has not confirmed yet.
    prisma.expensePayment.count({ where: { status: 'SENT', share: { expense: { paidByUserId: userId, group: { memberships: { some: { userId } }, archivedAt: null } } } } }),
  ]);
  const mine = groups.flatMap(group => group.members.filter(member => member.isYou));
  const owed = mine.filter(member => member.owedCents > 0), owe = mine.filter(member => member.owesCents > 0);
  if (!owed.length && !owe.length && !awaitingConfirmation) return null;
  return {
    owedCents: owed.reduce((sum, member) => sum + member.owedCents, 0), owedGroups: owed.length,
    oweCents: owe.reduce((sum, member) => sum + member.owesCents, 0), oweGroups: owe.length,
    awaitingConfirmation,
  };
}

async function upcomingBills(userId: string, window: ReturnType<typeof weekWindow>): Promise<Digest['comingUp']> {
  // The window ends at the start of today, which is also where "the next seven days" begins.
  const from = window.end, until = new Date(from.getTime() + 7 * DAY_MS);
  const bills = await prisma.recurringBill.findMany({
    where: { paused: false, group: { archivedAt: null, memberships: { some: { userId } } } },
    include: { cycles: true },
  });
  const due: Digest['comingUp'] = [];
  for (const bill of bills) {
    const date = cycleDate(bill.startDate, bill.intervalEvery, bill.intervalUnit, bill.nextCycle);
    if (date < from || date >= until) continue;
    const plan = planSchema.safeParse(bill.cycles.find(cycle => cycle.index === bill.nextCycle)?.plan ?? bill.defaultPlan);
    const shareCents = plan.success ? plan.data.shares[userId] : undefined;
    if (shareCents) due.push({ title: bill.title, date: isoDate(date), shareCents });
  }
  return due.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

/** Everything the weekly email says about one user. Sections with nothing to show are null or empty. */
export async function buildWeeklyDigest(userId: string, now = new Date()): Promise<Digest> {
  const window = weekWindow(now);
  const [user, week, attention, splitting, settling, comingUp] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } }),
    weekSpending(userId, now, window),
    attentionAlerts(userId),
    splittingSummary(userId, window),
    settlingSummary(userId, now),
    upcomingBills(userId, window),
  ]);
  const weekCents = CATEGORY_KEYS.reduce((sum, key) => sum + week.byCategory[key], 0);
  const plannedCents = week.current.categories.reduce((sum, category) => sum + category.plannedCents, 0);
  const spentCents = week.current.categories.reduce((sum, category) => sum + category.spentCents, 0);
  return {
    firstName: user.name.trim().split(/\s+/)[0] ?? user.name,
    period: { start: window.startDate, end: window.endDate },
    alerts: [...attention, ...limitAlerts(week.current.categories)],
    spending: weekCents > 0 ? {
      weekCents,
      topCategories: CATEGORY_KEYS.filter(key => week.byCategory[key] > 0).sort((a, b) => week.byCategory[b] - week.byCategory[a]).slice(0, 3)
        .map(key => ({ key, label: CATEGORY_LABELS[key], cents: week.byCategory[key] })),
      month: plannedCents > 0 ? {
        label: new Date(`${week.current.month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }),
        plannedCents, spentCents, daysLeft: week.current.daysLeft,
      } : null,
    } : null,
    splitting, settling, comingUp,
  };
}
