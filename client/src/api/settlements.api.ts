import { apiRequest } from './client';
export type SettlementPair = { senderId: string; senderName: string; recipientId: string; recipientName: string; amountCents: number; confirmedCents: number; pendingCents: number; unreportedCents: number; pendingPayments: { id: string; cents: number; method: string | null }[] };
export type SettlementBatch = { id: string; groupId: string; groupName: string; createdAt: string; totalCents: number; completed: boolean; expenses: { id: string; title: string }[]; pairs: SettlementPair[] };
export type SettlementPreview = { expenseIds: string[]; totalCents: number; expenses: { id: string; title: string; outstandingCents: number }[] };
export type SettlementInboxData = { userId: string; batches: SettlementBatch[]; notices: { id: string; batchId: string; message: string; kind: string; createdAt: string }[] };
export const paymentMethods = ['Venmo', 'Zelle', 'PayPal', 'Cash', 'Bank transfer', 'Other'] as const;
export const settlementsApi = {
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
  dismiss: (id: string) => apiRequest(`/settlement-notices/${id}/read`, { method: 'POST' }),
};
