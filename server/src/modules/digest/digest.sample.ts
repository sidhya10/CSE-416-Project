import type { Digest } from './digest.service.js';

/** The numbers from the email wireframe, for previewing the template without any account data. */
export const sampleDigest: Digest = {
  firstName: 'Sidhya',
  period: { start: '2026-10-20', end: '2026-10-26' },
  alerts: [
    { tone: 'attention', title: 'Bank connection needs re-authentication', detail: '6 transactions pending review' },
    { tone: 'over', title: 'Dining is over limit', detail: '$412 of $365 budget used' },
    { tone: 'near', title: 'Shopping near limit', detail: '86% of budget ($258 of $300)' },
  ],
  spending: {
    weekCents: 18240,
    topCategories: [
      { key: 'dining', label: 'Dining', cents: 7410 },
      { key: 'groceries', label: 'Groceries', cents: 5200 },
      { key: 'transit', label: 'Transit', cents: 2130 },
    ],
    month: { label: 'October', plannedCents: 98000, spentCents: 57000, daysLeft: 9 },
  },
  splitting: { count: 4, totalCents: 21500, paidCents: 14000, shareCents: 5250 },
  settling: { owedCents: 3800, owedGroups: 2, oweCents: 1250, oweGroups: 1, awaitingConfirmation: 1 },
  comingUp: [{ title: 'Rent', date: '2026-10-31', shareCents: 85000 }],
};
