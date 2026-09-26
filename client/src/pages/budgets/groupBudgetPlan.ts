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

// Sample fixture data mirroring the Figma mockup and the sample groups in
// GroupsWorkspace.tsx exactly (same names, members, and per-group member
// counts). Not wired to a backend yet — mirrors the pattern used by
// categoryPlan.ts's CATEGORY_BUDGETS until group budgets have a real data source.
export const GROUP_BUDGETS: GroupBudget[] = [
  {
    id: 1,
    name: 'Boston weekend',
    color: 'gold',
    memberInfo: '4 members · Trip expenses',
    spentCents: 68420,
    plannedCents: 90000,
    daysLeft: 6,
    members: [
      { id: 'vivian', name: 'Vivian (You)', avatarColor: 'green', barColor: '#1f6e52', pct: 32, paidCents: 22000 },
      { id: 'nicole', name: 'Nicole', avatarColor: 'mint', barColor: '#3f9d72', pct: 41, paidCents: 28370 },
      { id: 'sidhya', name: 'Sidhya', avatarColor: 'blue-solid', barColor: '#4a7fc4', pct: 26, paidCents: 18050 },
      { id: 'eva', name: 'Eva', avatarColor: 'peach', barColor: '#e86e57', pct: 6, oweCents: 3820 },
    ],
    settleUp: {
      title: '$38.20 left to settle',
      body: "Eva still owes for this trip — settle up whenever you're ready.",
    },
  },
  {
    id: 2,
    name: 'Apartment 4B',
    color: 'green',
    memberInfo: '3 members · Shared apartment costs',
    spentCents: 124000,
    plannedCents: 150000,
    daysLeft: 9,
    members: [
      { id: 'vivian', name: 'Vivian (You)', avatarColor: 'green', barColor: '#1f6e52', pct: 50, paidCents: 62000 },
      { id: 'nicole', name: 'Nicole', avatarColor: 'mint', barColor: '#3f9d72', pct: 33, paidCents: 41500 },
      { id: 'eva', name: 'Eva', avatarColor: 'peach', barColor: '#e86e57', pct: 17, oweCents: 20500 },
    ],
    settleUp: {
      title: '$205.00 left to settle',
      body: "Eva still owes for groceries and utilities — settle up whenever you're ready.",
    },
  },
  {
    id: 3,
    name: 'WiCS board',
    color: 'blue',
    memberInfo: '7 members · Event costs',
    spentCents: 61200,
    plannedCents: 80000,
    daysLeft: 14,
    members: [
      { id: 'vivian', name: 'Vivian (You)', avatarColor: 'green', barColor: '#1f6e52', pct: 33, paidCents: 20000 },
      { id: 'nicole', name: 'Nicole', avatarColor: 'mint', barColor: '#3f9d72', pct: 25, paidCents: 15000 },
      { id: 'sidhya', name: 'Sidhya', avatarColor: 'blue-solid', barColor: '#4a7fc4', pct: 15, paidCents: 9000 },
      { id: 'eva', name: 'Eva', avatarColor: 'peach', barColor: '#5b8fa8', pct: 13, paidCents: 8000 },
      { id: 'jordan', name: 'Jordan', avatarColor: 'sand', barColor: '#e86e57', pct: 8, oweCents: 5000 },
      { id: 'maya', name: 'Maya', avatarColor: 'mint', barColor: '#e86e57', pct: 4, oweCents: 2500 },
      { id: 'alex', name: 'Alex', avatarColor: 'sand', barColor: '#e86e57', pct: 3, oweCents: 1700 },
    ],
    settleUp: {
      title: '$92.00 left to settle',
      body: 'Jordan, Maya, and Alex still owe their share of board event costs.',
    },
  },
  {
    id: 4,
    name: 'Apartment bills',
    color: 'gold',
    memberInfo: '3 members · Recurring',
    spentCents: 187500,
    plannedCents: 187500,
    daysLeft: 4,
    members: [
      { id: 'vivian', name: 'Vivian (You)', avatarColor: 'green', barColor: '#1f6e52', pct: 100, paidCents: 187500 },
      { id: 'nicole', name: 'Nicole', avatarColor: 'mint', barColor: '#e86e57', pct: 33, oweCents: 62500 },
      { id: 'eva', name: 'Eva', avatarColor: 'peach', barColor: '#e86e57', pct: 33, oweCents: 62500 },
    ],
    settleUp: {
      title: '$1,250.00 left to settle',
      body: "Nicole and Eva each owe their share of this month's rent and internet.",
    },
  },
];

// GROUP_BUDGETS is a non-empty literal, so this index access is always
// defined; asserted once here (with noUncheckedIndexedAccess on) instead of
// at every call site that needs a guaranteed fallback.
export const DEFAULT_GROUP_BUDGET = GROUP_BUDGETS[0] as GroupBudget;

export const groupBudgetPct = (budget: GroupBudget) =>
  budget.plannedCents ? Math.min(100, Math.max(0, (budget.spentCents / budget.plannedCents) * 100)) : 0;
