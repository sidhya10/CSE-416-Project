import { prisma } from '../../config/database.js';
import { groupBalances } from '../expenses/expense.service.js';
import { CATEGORY_KEYS, MAX_SAVED_SCENARIOS, categorize, monthWindow, recentMonths, type CategoryKey } from './budget.categories.js';

export class BudgetError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const isoDate = (value: Date) => value.toISOString().slice(0, 10);

type CategoryTransaction = { linkedBank?: { merchant: string; date: string; amountCents: number }; id: string; merchant: string; date: string; amountCents: number; pending: boolean };

/** This month's personal budget: category limits plus spending from the user's visible bank accounts. */
export async function personalBudget(userId: string, now = new Date()) {
  const window = monthWindow(now);
  const [limits, rows, connections, shares] = await Promise.all([
    prisma.categoryLimit.findMany({ where: { userId } }),
    // Plaid reports money leaving an account as a positive amount; refunds and deposits are negative.
    prisma.bankTransaction.findMany({
      where: { amountCents: { gt: 0 }, date: { gte: window.start, lt: window.end }, account: { hidden: false, connection: { userId } } },
      include: { linkedExpense: { select: { id: true, budgetCategory: true } } },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    }),
    prisma.bankConnection.findMany({ where: { userId }, select: { lastSyncedAt: true } }),
    prisma.expenseShare.findMany({ where: { userId, expense: { expenseDate: { gte: window.start, lt: window.end } } }, include: { expense: { include: { group: { select: { name: true } }, bankTransaction: { select: { merchant: true, name: true, date: true, amountCents: true } } } } } }),
  ]);
  const transactions = Object.fromEntries(CATEGORY_KEYS.map(key => [key, [] as CategoryTransaction[]])) as Record<CategoryKey, CategoryTransaction[]>;
  const spent = Object.fromEntries(CATEGORY_KEYS.map(key => [key, 0])) as Record<CategoryKey, number>;
  for (const row of rows) {
    if (row.linkedExpense) continue;
    const key = categorize(row);
    if (!key) continue;
    transactions[key].push({ id: row.id, merchant: row.merchant ?? row.name, date: isoDate(row.date), amountCents: row.amountCents, pending: row.pending });
    spent[key] += row.amountCents;
  }
  for (const share of shares) {
    const expense = share.expense;
    const key = CATEGORY_KEYS.includes(share.budgetCategory as CategoryKey) ? share.budgetCategory as CategoryKey : 'other';
    spent[key] += share.totalCents;
    transactions[key].push({ id: `share-${expense.id}`, merchant: `${expense.title} · Your share · ${expense.group.name}`, date: isoDate(expense.expenseDate), amountCents: share.totalCents, pending: false,
      ...(expense.paidByUserId === userId && expense.bankTransaction ? { linkedBank: { merchant: expense.bankTransaction.merchant ?? expense.bankTransaction.name, date: isoDate(expense.bankTransaction.date), amountCents: expense.bankTransaction.amountCents } } : {}) });
  }
  for (const key of CATEGORY_KEYS) transactions[key].sort((a, b) => b.date.localeCompare(a.date));
  const limitFor = new Map(limits.map(limit => [limit.category, limit.limitCents]));
  const synced = connections.flatMap(connection => connection.lastSyncedAt ? [connection.lastSyncedAt.getTime()] : []);
  return {
    month: window.month, daysInMonth: window.daysInMonth, daysLeft: window.daysLeft,
    hasBankConnection: connections.length > 0, lastSyncedAt: synced.length ? Math.max(...synced) : null,
    categories: CATEGORY_KEYS.map(key => ({ key, plannedCents: limitFor.get(key) ?? 0, spentCents: spent[key] })),
    transactions,
  };
}

export async function saveLimits(userId: string, limits: Partial<Record<CategoryKey, number>>) {
  await prisma.$transaction(Object.entries(limits).map(([category, limitCents]) =>
    prisma.categoryLimit.upsert({ where: { userId_category: { userId, category } }, create: { userId, category, limitCents }, update: { limitCents } })));
  return personalBudget(userId);
}

type ScenarioLimits = Partial<Record<CategoryKey, number>>;
const toScenario = (row: { id: string; name: string; limits: unknown; updatedAt: Date }) =>
  ({ id: row.id, name: row.name, limits: row.limits as ScenarioLimits, savedAt: row.updatedAt.getTime() });

/** The user's saved What-if scenarios, most recently saved first. They never change the real budget. */
export async function listScenarios(userId: string) {
  const rows = await prisma.whatIfScenario.findMany({ where: { userId }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }] });
  return rows.map(toScenario);
}

export async function createScenario(userId: string, name: string, limits: ScenarioLimits) {
  const saved = await prisma.whatIfScenario.count({ where: { userId } });
  if (saved >= MAX_SAVED_SCENARIOS) throw new BudgetError(409, `You already have ${MAX_SAVED_SCENARIOS} saved scenarios. Delete one before saving another.`);
  return toScenario(await prisma.whatIfScenario.create({ data: { userId, name, limits } }));
}

export async function updateScenario(userId: string, id: string, name: string, limits: ScenarioLimits) {
  const { count } = await prisma.whatIfScenario.updateMany({ where: { id, userId }, data: { name, limits } });
  if (!count) throw new BudgetError(404, 'Scenario not found');
  return toScenario(await prisma.whatIfScenario.findUniqueOrThrow({ where: { id } }));
}

export async function deleteScenario(userId: string, id: string) {
  const { count } = await prisma.whatIfScenario.deleteMany({ where: { id, userId } });
  if (!count) throw new BudgetError(404, 'Scenario not found');
}

/**
 * This month's budget for each active group the user belongs to. Spending is the group's expense totals for the month.
 * Who owes whom comes from the shared expense ledger (shares minus confirmed payments), across all months.
 */
export async function groupBudgets(userId: string, now = new Date()) {
  const window = monthWindow(now);
  const groups = await prisma.group.findMany({
    where: { archivedAt: null, memberships: { some: { userId } } },
    include: { memberships: { orderBy: { joinedAt: 'asc' } }, budgetPlan: true },
    orderBy: { updatedAt: 'desc' },
  });
  if (!groups.length) return [];
  const groupIds = groups.map(group => group.id);
  const [expenses, balances] = await Promise.all([
    prisma.expense.findMany({ where: { groupId: { in: groupIds }, expenseDate: { gte: window.start, lt: window.end } }, select: { groupId: true, paidByUserId: true, totalCents: true } }),
    Promise.all(groups.map(group => groupBalances(group.id, userId))),
  ]);
  const people = await prisma.user.findMany({ where: { id: { in: [...new Set(balances.flat().map(balance => balance.userId))] } }, select: { id: true, name: true } });
  const nameOf = new Map(people.map(person => [person.id, person.name]));
  return groups.map((group, index) => {
    const monthly = expenses.filter(expense => expense.groupId === group.id);
    const memberships = group.memberships;
    const role = memberships.find(member => member.userId === userId)?.role;
    const members = (balances[index] ?? [])
      .filter(balance => balance.balanceCents !== 0 || memberships.some(member => member.userId === balance.userId))
      .map(balance => ({
        id: balance.userId, name: nameOf.get(balance.userId) ?? 'Former member', isYou: balance.userId === userId,
        paidCents: monthly.filter(expense => expense.paidByUserId === balance.userId).reduce((sum, expense) => sum + expense.totalCents, 0),
        owesCents: Math.max(0, -balance.balanceCents), owedCents: Math.max(0, balance.balanceCents),
      }))
      .sort((a, b) => Number(b.isYou) - Number(a.isYou) || a.name.localeCompare(b.name));
    return {
      id: group.id, name: group.name, color: group.color, type: group.type, memberCount: memberships.length,
      spentCents: monthly.reduce((sum, expense) => sum + expense.totalCents, 0), plannedCents: group.budgetPlan?.plannedCents ?? 0,
      daysLeft: window.daysLeft, canEditPlan: role === 'OWNER' || role === 'ADMIN', members,
    };
  });
}

export async function saveGroupPlan(userId: string, groupId: string, plannedCents: number) {
  const member = await prisma.groupMembership.findUnique({ where: { groupId_userId: { groupId, userId } } });
  if (!member) throw new BudgetError(404, 'Group not found');
  if (member.role === 'MEMBER') throw new BudgetError(403, 'Only group owners and admins can set the shared plan');
  await prisma.groupBudgetPlan.upsert({ where: { groupId }, create: { groupId, plannedCents }, update: { plannedCents } });
  return groupBudgets(userId);
}

/** What the Home tab needs beyond the budgets: monthly spending and income, payments awaiting confirmation, and the latest group expense. */
export async function homeSummary(userId: string, now = new Date()) {
  const window = monthWindow(now);
  const { keys, start } = recentMonths(now, 4);
  const inGroup = { memberships: { some: { userId } }, archivedAt: null };
  const [rows, pending, latest, shares] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: { linkedExpense: null, date: { gte: start, lt: window.end }, account: { hidden: false, connection: { userId } } },
      select: { date: true, amountCents: true, category: true, name: true, merchant: true },
    }),
    prisma.expensePayment.findMany({ where: { status: 'SENT', share: { expense: { paidByUserId: userId, group: inGroup } } }, select: { amountCents: true } }),
    prisma.expense.findFirst({
      where: { group: inGroup }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { title: true, totalCents: true, createdAt: true, creator: { select: { id: true, name: true } }, group: { select: { name: true } } },
    }),
    prisma.expenseShare.findMany({ where: { userId, expense: { expenseDate: { gte: start, lt: window.end } } }, select: { totalCents: true, expense: { select: { expenseDate: true } } } }),
  ]);
  const months = new Map(keys.map(key => [key, { month: key, spendingCents: 0, incomeCents: 0 }]));
  for (const row of rows) {
    const month = months.get(row.date.toISOString().slice(0, 7));
    if (!month) continue;
    // Money leaving an account is a positive Plaid amount; only deposits categorized as income count as income.
    if (row.amountCents > 0) { if (categorize(row)) month.spendingCents += row.amountCents; }
    else if (row.category === 'INCOME') month.incomeCents += -row.amountCents;
  }
  for (const share of shares) { const month = months.get(share.expense.expenseDate.toISOString().slice(0, 7)); if (month) month.spendingCents += share.totalCents; }
  return {
    history: keys.map(key => months.get(key)!),
    pendingPayments: { count: pending.length, cents: pending.reduce((sum, payment) => sum + payment.amountCents, 0) },
    latestExpense: latest && { title: latest.title, groupName: latest.group.name, creatorName: latest.creator.name, isYou: latest.creator.id === userId, totalCents: latest.totalCents, createdAt: latest.createdAt.toISOString() },
  };
}
