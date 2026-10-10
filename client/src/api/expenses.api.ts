import { apiRequest } from './client';
import type { PreviewSplit } from '../pages/expenses/split';

type Payment = { id: string; amountCents: number; status: 'SENT' | 'CONFIRMED' | 'ISSUE'; sentAt: string; resolvedAt?: string };
export type ApiExpense = {
  receipt?: { name: string; mimeType: string } | null;
  id: string; version: number; title: string; expenseDate: string; createdByUserId: string; creator: { id: string; name: string };
  paidByUserId: string; splitMode: 'EQUAL' | 'ITEMS'; totalCents: number; taxCents: number; tipCents: number; otherCents: number;
  items: { id: string; name: string; quantity: number; unitPriceCents: number; assignments: { userId: string }[] }[];
  shares: { userId: string; user: { id: string; name: string }; baseCents: number; totalCents: number; payments: Payment[] }[];
};

// "you" is a presentation alias only. Every API request uses real database user IDs.
export function toExpenseInput(split: PreviewSplit, currentUserId: string) {
  const id = (value: string) => value === 'you' ? currentUserId : value;
  return {
    receipt: split.receiptAttachment,
    title: split.name, expenseDate: split.date.slice(0, 10), paidByUserId: id(split.payerId),
    splitMode: split.mode === 'equal' ? 'EQUAL' : 'ITEMS', participantIds: split.shares.map(share => id(share.memberId)),
    items: split.items.map(item => ({ name: item.name, quantity: item.quantity ?? 1, unitPriceCents: item.unitCents ?? item.cents,
      assignedUserIds: split.mode === 'items' ? (split.assignments[item.id] ?? []).map(id) : [] })),
    taxCents: split.feeBreakdown?.tax ?? 0, tipCents: split.feeBreakdown?.tip ?? 0, otherCents: split.feeBreakdown?.other ?? split.feeCents,
  };
}
export function fromApiExpense(expense: ApiExpense, currentUserId: string): PreviewSplit {
  const id = (value: string) => value === currentUserId ? 'you' : value;
  return {
    receiptName: expense.receipt?.name, receiptMimeType: expense.receipt?.mimeType,
    expenseId: expense.id, version: expense.version, creatorId: id(expense.createdByUserId), creatorName: expense.creator.name,
    hasPaymentHistory: expense.shares.some(share => share.payments.length > 0),
    memberNames: Object.fromEntries(expense.shares.map(share => [id(share.userId), share.user.name])),
    name: expense.title, date: expense.expenseDate, payerId: id(expense.paidByUserId), mode: expense.splitMode === 'EQUAL' ? 'equal' : 'items',
    items: expense.items.map((item, index) => ({ id: index, name: item.name, quantity: item.quantity, unitCents: item.unitPriceCents, cents: item.quantity * item.unitPriceCents })),
    assignments: Object.fromEntries(expense.items.map((item, index) => [index, item.assignments.map(assignment => id(assignment.userId))])),
    totalCents: expense.totalCents, feeCents: expense.taxCents + expense.tipCents + expense.otherCents,
    feeBreakdown: { tax: expense.taxCents, tip: expense.tipCents, other: expense.otherCents },
    shares: expense.shares.map(share => ({ memberId: id(share.userId), baseCents: share.baseCents, totalCents: share.totalCents,
      reimbursementCents: share.userId === expense.paidByUserId ? 0 : share.totalCents })),
    payments: expense.shares.filter(share => share.payments.length).map(share => {
      const sent = share.payments.filter(payment => payment.status === 'SENT');
      const confirmed = share.payments.filter(payment => payment.status === 'CONFIRMED');
      const receivedCents = confirmed.reduce((sum, payment) => sum + payment.amountCents, 0);
      const latest = share.payments.at(-1);
      const issue = !sent.length && receivedCents < share.totalCents && latest?.status === 'ISSUE';
      return { memberId: id(share.userId), payerId: id(expense.paidByUserId), receivedCents,
        pendingCents: issue ? latest.amountCents : sent.reduce((sum, payment) => sum + payment.amountCents, 0),
        pendingIds: sent.map(payment => payment.id), issue: !!issue, sentAt: latest?.sentAt, receivedAt: confirmed.at(-1)?.resolvedAt };
    }),
  };
}
export const expensesApi = {
  list: (groupId: string) => apiRequest<{ expenses: ApiExpense[] }>(`/groups/${groupId}/expenses`),
  get: (id: string) => apiRequest<{ expense: ApiExpense }>(`/expenses/${id}`),
  create: (groupId: string, split: PreviewSplit, userId: string, clientRequestId: string) => apiRequest<{ expense: ApiExpense }>(`/groups/${groupId}/expenses`, { method: 'POST', body: JSON.stringify({ clientRequestId, expense: toExpenseInput(split, userId) }) }),
  edit: (split: PreviewSplit, userId: string, id: string, version: number) => apiRequest<{ expense: ApiExpense }>(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify({ version, expense: toExpenseInput(split, userId) }) }),
  send: (id: string, amountCents: number, clientRequestId: string) => apiRequest(`/expenses/${id}/payments`, { method: 'POST', body: JSON.stringify({ amountCents, clientRequestId }) }),
  resolve: (id: string, paymentId: string, status: 'CONFIRMED' | 'ISSUE') => apiRequest(`/expenses/${id}/payments/${paymentId}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
};
