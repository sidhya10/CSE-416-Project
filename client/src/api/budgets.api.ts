import { apiRequest } from './client';

export type CategoryKey = 'dining' | 'groceries' | 'transit' | 'shopping' | 'other';

export type ApiCategoryTransaction = { id: string; merchant: string; date: string; amountCents: number; pending: boolean };
export type ApiPersonalBudget = {
  month: string; daysInMonth: number; daysLeft: number; hasBankConnection: boolean; lastSyncedAt: number | null;
  categories: { key: CategoryKey; plannedCents: number; spentCents: number }[];
  transactions: Record<CategoryKey, ApiCategoryTransaction[]>;
};

export type ApiGroupBudgetMember = { id: string; name: string; isYou: boolean; paidCents: number; owesCents: number; owedCents: number };
export type ApiGroupBudget = {
  id: string; name: string; color: string; type: 'General' | 'Trip' | 'Recurring'; memberCount: number;
  spentCents: number; plannedCents: number; daysLeft: number; canEditPlan: boolean; members: ApiGroupBudgetMember[];
};

export const budgetsApi = {
  personal: () => apiRequest<ApiPersonalBudget>('/budgets/personal'),
  saveLimits: (limits: Partial<Record<CategoryKey, number>>) =>
    apiRequest<ApiPersonalBudget>('/budgets/personal/limits', { method: 'PUT', body: JSON.stringify({ limits }) }),
  groups: () => apiRequest<{ groups: ApiGroupBudget[] }>('/budgets/groups'),
  saveGroupPlan: (groupId: string, plannedCents: number) =>
    apiRequest<{ groups: ApiGroupBudget[] }>(`/budgets/groups/${groupId}/plan`, { method: 'PUT', body: JSON.stringify({ plannedCents }) }),
};
