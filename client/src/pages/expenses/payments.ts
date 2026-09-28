import type { PreviewSplit } from './split';

export type PaymentRecord = {
  memberId: string; payerId: string; receivedCents: number; pendingCents: number;
  issue: boolean; sentAt?: string; receivedAt?: string;
};
export type PaymentAction = 'sent' | 'received' | 'issue';
export type PaymentStatus = 'Not sent' | 'Awaiting receipt' | 'Settled' | 'Payment issue' | 'No payment needed';
export function paymentFor(split: PreviewSplit, memberId: string) {
  const record = split.payments?.find(payment => payment.memberId === memberId && payment.payerId === split.payerId);
  const share = split.shares.find(value => value.memberId === memberId)?.reimbursementCents ?? 0;
  const received = record?.receivedCents ?? 0;
  const remaining = Math.max(0, share - received);
  const status: PaymentStatus = record?.pendingCents ? record.issue ? 'Payment issue' : 'Awaiting receipt' : remaining ? 'Not sent' : received ? 'Settled' : 'No payment needed';
  return { record, share, received, remaining, status };
}

// The API must enforce these same actor checks when persistence is connected.
export function updatePayment(split: PreviewSplit, actorId: string, memberId: string, action: PaymentAction, at = new Date().toISOString()): PreviewSplit {
  if (memberId === split.payerId || !split.shares.some(share => share.memberId === memberId)) return split;
  const state = paymentFor(split, memberId);
  const old = state.record ?? { memberId, payerId: split.payerId, receivedCents: 0, pendingCents: 0, issue: false };
  let next: PaymentRecord;
  if (action === 'sent') {
    if (actorId !== memberId || !state.remaining || state.status === 'Awaiting receipt') return split;
    next = { ...old, pendingCents: state.remaining, issue: false, sentAt: at };
  } else {
    if (actorId !== split.payerId || !old.pendingCents) return split;
    next = action === 'issue' ? { ...old, issue: true } : { ...old, receivedCents: old.receivedCents + old.pendingCents, pendingCents: 0, issue: false, receivedAt: at };
  }
  return { ...split, payments: [...(split.payments ?? []).filter(payment => payment !== state.record), next] };
}
