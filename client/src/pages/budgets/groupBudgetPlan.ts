import type { ApiGroupBudget } from '../../api/budgets.api';

export type GroupMemberShare = {
  id: string;
  name: string;
  avatarColor: string;
  barColor: string;
  pct: number;
  // oweCents: still owes the group (net of confirmed payments); creditCents: is still owed money back.
  // paidCents: fronted for this month's expenses. A member who owes is shown by oweCents, everyone else by paidCents.
  paidCents: number;
  oweCents: number;
  creditCents: number;
};

export type GroupBudget = {
  id: string;
  name: string;
  color: string;
  memberInfo: string;
  spentCents: number;
  plannedCents: number;
  daysLeft: number;
  canEditPlan: boolean;
  members: GroupMemberShare[];
};

const AVATARS = ['green', 'mint', 'blue-solid', 'peach', 'sand'];
const BAR_COLORS = ['#1f6e52', '#3f9d72', '#4a7fc4', '#5b8fa8', '#f6bd4d'];
const OWE_COLOR = '#e86e57';

export function toGroupBudget(group: ApiGroupBudget): GroupBudget {
  const members = group.members.map((member, index): GroupMemberShare => {
    const share = member.owesCents > 0 ? member.owesCents : member.paidCents;
    return {
      id: member.id, name: member.isYou ? 'You' : member.name,
      avatarColor: AVATARS[index % AVATARS.length] ?? 'mint',
      barColor: member.owesCents > 0 ? OWE_COLOR : BAR_COLORS[index % BAR_COLORS.length] ?? '#3f9d72',
      pct: group.spentCents ? Math.min(100, Math.max(0, (share / group.spentCents) * 100)) : 0,
      paidCents: member.paidCents, oweCents: member.owesCents, creditCents: member.owedCents,
    };
  });
  return {
    id: group.id, name: group.name, color: group.color,
    memberInfo: `${group.memberCount} ${group.memberCount === 1 ? 'member' : 'members'} · ${group.type} expenses`,
    spentCents: group.spentCents, plannedCents: group.plannedCents, daysLeft: group.daysLeft, canEditPlan: group.canEditPlan, members,
  };
}

export const groupBudgetPct = (budget: GroupBudget) =>
  budget.plannedCents ? Math.min(100, Math.max(0, (budget.spentCents / budget.plannedCents) * 100)) : 0;

export type Settlement = { fromId: string; fromName: string; toId: string; toName: string; cents: number };

// Each debtor repays the members who are owed, in proportion to how much each is owed.
// Remainder cents go to the largest creditors first so the total always matches.
export function settlementsFor(budget: GroupBudget): Settlement[] {
  const creditors = budget.members.filter(m => m.creditCents > 0);
  const creditTotal = creditors.reduce((sum, m) => sum + m.creditCents, 0);
  if (creditTotal <= 0) return [];
  const sorted = [...creditors].sort((a, b) => b.creditCents - a.creditCents);
  const result: Settlement[] = [];
  for (const debtor of budget.members.filter(m => m.oweCents > 0)) {
    const owed = debtor.oweCents;
    const shares = sorted.map(p => Math.floor((owed * p.creditCents) / creditTotal));
    let remainder = owed - shares.reduce((a, b) => a + b, 0);
    for (let i = 0; remainder > 0; i = (i + 1) % sorted.length, remainder--) shares[i] = (shares[i] ?? 0) + 1;
    sorted.forEach((p, i) => {
      const cents = shares[i] ?? 0;
      if (cents > 0) result.push({ fromId: debtor.id, fromName: debtor.name, toId: p.id, toName: p.name, cents });
    });
  }
  return result;
}

export const totalOwedCents = (budget: GroupBudget) => budget.members.reduce((sum, m) => sum + m.oweCents, 0);

const joinNames = (names: string[]) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

// "Jordan still owes ..." / "You and Alex still owe ..."
export function settleUpBody(budget: GroupBudget): string {
  const debtors = budget.members.filter(m => m.oweCents > 0).map(m => m.name);
  return `${joinNames(debtors)} still ${debtors.length === 1 && debtors[0] !== 'You' ? 'owes' : 'owe'} for shared expenses — settle up whenever you're ready.`;
}
