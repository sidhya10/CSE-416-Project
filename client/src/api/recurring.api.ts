import { apiRequest } from './client';
export type CyclePlan = { payerId: string; shares: Record<string, number> };
export type ApiRecurringBill = { id: string; title: string; amountCents: number; startDate: string; frequency: 'Weekly' | 'Monthly' | 'Quarterly' | 'Semi-yearly' | 'Yearly' | 'Custom'; intervalEvery: number; intervalUnit: 'days' | 'weeks' | 'months' | 'years'; defaultPlan: CyclePlan; cycles: { index: number; plan: CyclePlan }[]; paused: boolean; error: string | null; nextDate: string };
export const recurringApi = {
  create: (groupId: string, input: { title: string; amountCents: number; startDate: string; frequency: ApiRecurringBill['frequency']; customEvery: number; customUnit: ApiRecurringBill['intervalUnit']; defaultPlan: CyclePlan }) => apiRequest(`/groups/${groupId}/recurring`, { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: { defaultPlan?: CyclePlan; paused?: boolean }) => apiRequest(`/recurring/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  saveCycle: (id: string, index: number, plan: CyclePlan) => apiRequest(`/recurring/${id}/cycles/${index}`, { method: 'PUT', body: JSON.stringify(plan) }),
};
