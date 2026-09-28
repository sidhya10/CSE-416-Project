export type GroupMemberShare = {
  id: string;
  name: string;
  avatarColor: string;
  barColor: string;
  pct: number;
  // Exactly one of paidCents / oweCents is set: paid = contributed toward the
  // group total, owe = still owes their share back to the group.
  paidCents?: number;
  oweCents?: number;
};

export type GroupBudget = {
  id: number;
  name: string;
  color: string;
  memberInfo: string;
  spentCents: number;
  plannedCents: number;
  daysLeft: number;
  members: GroupMemberShare[];
  settleUp: { title: string; body: string };
};

// Generic sample fixtures matching the three preset groups in
// GroupsWorkspace.tsx (same names, members, and per-group member counts). Not wired to a backend yet — mirrors the pattern used by
// categoryPlan.ts's CATEGORY_BUDGETS until group budgets have a real data source.
export const GROUP_BUDGETS: GroupBudget[] = [
  {
    id: 1,
    name: 'Weekend Trip',
    color: 'gold',
    memberInfo: '4 members · Trip expenses',
    spentCents: 68420,
    plannedCents: 90000,
    daysLeft: 6,
    members: [
      { id: 'you', name: 'You', avatarColor: 'green', barColor: '#1f6e52', pct: 32, paidCents: 22000 },
      { id: 'alex', name: 'Alex', avatarColor: 'mint', barColor: '#3f9d72', pct: 41, paidCents: 28370 },
      { id: 'taylor', name: 'Taylor', avatarColor: 'blue-solid', barColor: '#4a7fc4', pct: 26, paidCents: 18050 },
      { id: 'jordan', name: 'Jordan', avatarColor: 'peach', barColor: '#e86e57', pct: 6, oweCents: 3820 },
    ],
    settleUp: {
      title: '$38.20 left to settle',
      body: "Jordan still owes for this trip — settle up whenever you're ready.",
    },
  },
  {
    id: 2,
    name: 'Shared Apartment',
    color: 'green',
    memberInfo: '3 members · Shared apartment costs',
    spentCents: 124000,
    plannedCents: 150000,
    daysLeft: 9,
    members: [
      { id: 'you', name: 'You', avatarColor: 'green', barColor: '#1f6e52', pct: 50, paidCents: 62000 },
      { id: 'alex', name: 'Alex', avatarColor: 'mint', barColor: '#3f9d72', pct: 33, paidCents: 41500 },
      { id: 'jordan', name: 'Jordan', avatarColor: 'peach', barColor: '#e86e57', pct: 17, oweCents: 20500 },
    ],
    settleUp: {
      title: '$205.00 left to settle',
      body: "Jordan still owes for groceries and utilities — settle up whenever you're ready.",
    },
  },
  {
    id: 3,
    name: 'Community Event',
    color: 'blue',
    memberInfo: '7 members · Event costs',
    spentCents: 61200,
    plannedCents: 80000,
    daysLeft: 14,
    members: [
      { id: 'you', name: 'You', avatarColor: 'green', barColor: '#1f6e52', pct: 33, paidCents: 20000 },
      { id: 'alex', name: 'Alex', avatarColor: 'mint', barColor: '#3f9d72', pct: 25, paidCents: 15000 },
      { id: 'taylor', name: 'Taylor', avatarColor: 'blue-solid', barColor: '#4a7fc4', pct: 15, paidCents: 9000 },
      { id: 'jordan', name: 'Jordan', avatarColor: 'peach', barColor: '#5b8fa8', pct: 13, paidCents: 8000 },
      { id: 'jordan', name: 'Jordan', avatarColor: 'sand', barColor: '#e86e57', pct: 8, oweCents: 5000 },
      { id: 'casey', name: 'Casey', avatarColor: 'mint', barColor: '#e86e57', pct: 4, oweCents: 2500 },
      { id: 'riley', name: 'Riley', avatarColor: 'sand', barColor: '#e86e57', pct: 3, oweCents: 1700 },
    ],
    settleUp: {
      title: '$92.00 left to settle',
      body: 'Morgan and Casey still owe their share of event costs.',
    },
  },
];

// GROUP_BUDGETS is a non-empty literal, so this index access is always
// defined; asserted once here (with noUncheckedIndexedAccess on) instead of
// at every call site that needs a guaranteed fallback.
export const DEFAULT_GROUP_BUDGET = GROUP_BUDGETS[0] as GroupBudget;

export const groupBudgetPct = (budget: GroupBudget) =>
  budget.plannedCents ? Math.min(100, Math.max(0, (budget.spentCents / budget.plannedCents) * 100)) : 0;
