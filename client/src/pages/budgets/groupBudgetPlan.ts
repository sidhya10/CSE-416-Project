export type GroupMemberShare = {
  id: string;
  name: string;
  avatarColor: string;
  barColor: string;
  pct: number;
  // Exactly one of paidCents / oweCents is set: paid = contributed toward the
  // group total, owe = still owes the current user for their share.
  paidCents?: number;
  oweCents?: number;
};

export type GroupBudget = {
  id: string;
  name: string;
  memberInfo: string;
  spentCents: number;
  plannedCents: number;
  daysLeft: number;
  members: GroupMemberShare[];
  settleUp: { title: string; body: string };
};

// Sample fixture data mirroring the Figma mockup exactly. Not wired to a
// backend yet — mirrors the pattern used by categoryPlan.ts's CATEGORY_BUDGETS
// until group budgets have a real data source.
export const GROUP_BUDGET: GroupBudget = {
  id: 'boston-weekend',
  name: 'Boston weekend',
  memberInfo: '4 members · Trip expenses',
  spentCents: 68420,
  plannedCents: 90000,
  daysLeft: 6,
  members: [
    { id: 'vivian', name: 'Vivian (You)', avatarColor: 'green', barColor: '#1f6e52', pct: 32, paidCents: 22000 },
    { id: 'sidhya', name: 'Sidhya', avatarColor: 'blue-solid', barColor: '#4a7fc4', pct: 26, paidCents: 18050 },
    { id: 'eva', name: 'Eva', avatarColor: 'peach', barColor: '#e86e57', pct: 6, oweCents: 3820 },
  ],
  settleUp: {
    title: '$18.40 left to settle',
    body: "Eva still owes Vivian for this trip — settle up whenever you're ready.",
  },
};

export const groupBudgetPct = (budget: GroupBudget) =>
  budget.plannedCents ? Math.min(100, Math.max(0, (budget.spentCents / budget.plannedCents) * 100)) : 0;
