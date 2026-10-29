import { apiRequest } from './client';
export type SettlementPair = { senderId: string; senderName: string; recipientId: string; recipientName: string; amountCents: number; confirmedCents: number; pendingCents: number; unreportedCents: number; pendingPayments: { id: string; cents: number; method: string | null }[] };
export type SettlementBatch = { id: string; groupId: string; groupName: string; createdAt: string; totalCents: number; completed: boolean; expenses: { id: string; title: string }[]; pairs: SettlementPair[] };
export type SettlementPreview = { expenseIds: string[]; totalCents: number; expenses: { id: string; title: string; outstandingCents: number }[] };
export type SettlementInboxData = { userId: string; batches: SettlementBatch[]; notices: { id: string; batchId: string; message: string; kind: string; createdAt: string }[] };
export const paymentMethods = ['Venmo', 'Zelle', 'PayPal', 'Cash', 'Bank transfer', 'Other'] as const;
export type AppNotice = { expenseId?: string; groupId: string; id: string; message: string; kind: string; createdAt: string; readAt: string | null };
export const settlementsApi = {
  deleteNotification: (id: string) => apiRequest(`/settlement-notices/${id}`, { method: 'DELETE' }),
  clearNotifications: () => apiRequest('/settlement-notices', { method: 'DELETE' }),
  notifications: () => apiRequest<{ notices: AppNotice[] }>('/settlement-notices'),
  inbox: async () => {
    const result = await apiRequest<SettlementInboxData>('/settlements');
    if (!result || !Array.isArray(result.batches) || !Array.isArray(result.notices) || typeof result.userId !== 'string') throw new Error('Unable to load payment notifications');
    return result;
  },
  preview: (groupId: string) => apiRequest<SettlementPreview>(`/groups/${groupId}/settlements/preview`),
  initialize: (groupId: string, input: { clientRequestId: string; expenseIds: string[]; totalCents: number }) => apiRequest<{ batch: SettlementBatch }>(`/groups/${groupId}/settlements`, { method: 'POST', body: JSON.stringify(input) }),
  report: (batchId: string, input: { recipientId: string; method: string; clientRequestId: string; amountCents: number }) => apiRequest(`/settlements/${batchId}/payments`, { method: 'POST', body: JSON.stringify(input) }),
  confirm: (batchId: string, input: { senderId: string; paymentIds: string[]; status: 'CONFIRMED' | 'ISSUE' }) => apiRequest(`/settlements/${batchId}/confirm`, { method: 'POST', body: JSON.stringify(input) }),
  remind: (batchId: string, recipientId: string) => apiRequest(`/settlements/${batchId}/reminders`, { method: 'POST', body: JSON.stringify({ recipientId }) }),
  reportGroup: (groupId: string, input: { recipientId: string; method: string; clientRequestId: string; allocations: { batchId: string; amountCents: number }[] }) => apiRequest(`/groups/${groupId}/settlement-payments`, { method: 'POST', body: JSON.stringify(input) }),
  confirmGroup: (groupId: string, input: { senderId: string; status: 'CONFIRMED' | 'ISSUE'; allocations: { batchId: string; paymentIds: string[] }[] }) => apiRequest(`/groups/${groupId}/settlement-confirmations`, { method: 'POST', body: JSON.stringify(input) }),
  remindGroup: (groupId: string, recipientId: string) => apiRequest(`/groups/${groupId}/settlement-reminders`, { method: 'POST', body: JSON.stringify({ recipientId }) }),
  markUnread: (id: string) => apiRequest(`/settlement-notices/${id}/unread`, { method: 'POST' }),
  dismiss: (id: string) => apiRequest(`/settlement-notices/${id}/read`, { method: 'POST' }),
};
