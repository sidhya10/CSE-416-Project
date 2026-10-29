import { apiRequest } from './client';

export type CategoryKey = 'dining' | 'groceries' | 'transit' | 'shopping' | 'other';

export type ApiCategoryTransaction = { id: string; merchant: string; date: string; amountCents: number; pending: boolean };
export type ApiPersonalBudget = {
  month: string; daysInMonth: number; daysLeft: number; hasBankConnection: boolean; lastSyncedAt: number | null;
  categories: { key: CategoryKey; plannedCents: number; spentCents: number }[];
  transactions: Record<CategoryKey, ApiCategoryTransaction[]>;
};

export type ApiScenario = { id: string; name: string; limits: Partial<Record<CategoryKey, number>>; savedAt: number };

export type ApiGroupBudgetMember = { id: string; name: string; isYou: boolean; paidCents: number; owesCents: number; owedCents: number };
export type ApiGroupBudget = {
  id: string; name: string; color: string; type: 'General' | 'Trip' | 'Recurring'; memberCount: number;
  spentCents: number; plannedCents: number; daysLeft: number; canEditPlan: boolean; members: ApiGroupBudgetMember[];
};

export type ApiHomeSummary = {
  history: { month: string; spendingCents: number; incomeCents: number }[];
  pendingPayments: { count: number; cents: number };
  latestExpense: { title: string; groupName: string; creatorName: string; isYou: boolean; totalCents: number; createdAt: string } | null;
};

export const budgetsApi = {
  personal: () => apiRequest<ApiPersonalBudget>('/budgets/personal'),
  saveLimits: (limits: Partial<Record<CategoryKey, number>>) =>
    apiRequest<ApiPersonalBudget>('/budgets/personal/limits', { method: 'PUT', body: JSON.stringify({ limits }) }),
  scenarios: () => apiRequest<{ scenarios: ApiScenario[] }>('/budgets/scenarios'),
  createScenario: (name: string, limits: ApiScenario['limits']) =>
    apiRequest<{ scenario: ApiScenario }>('/budgets/scenarios', { method: 'POST', body: JSON.stringify({ name, limits }) }),
  updateScenario: (id: string, name: string, limits: ApiScenario['limits']) =>
    apiRequest<{ scenario: ApiScenario }>(`/budgets/scenarios/${id}`, { method: 'PUT', body: JSON.stringify({ name, limits }) }),
  deleteScenario: (id: string) => apiRequest<void>(`/budgets/scenarios/${id}`, { method: 'DELETE' }),
  home: () => apiRequest<ApiHomeSummary>('/budgets/home'),
  groups: () => apiRequest<{ groups: ApiGroupBudget[] }>('/budgets/groups'),
  saveGroupPlan: (groupId: string, plannedCents: number) =>
    apiRequest<{ groups: ApiGroupBudget[] }>(`/budgets/groups/${groupId}/plan`, { method: 'PUT', body: JSON.stringify({ plannedCents }) }),
};
