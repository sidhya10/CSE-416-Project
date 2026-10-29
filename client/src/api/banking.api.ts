import { apiRequest } from './client';

export type ApiBankAccount = {
  id: string; connectionId: string; institution: string; nickname: string; last4: string; balanceCents: number;
  hidden: boolean; status: 'synced' | 'needs-attention'; statusDetail?: string; syncedAt: number | null;
};
type Accounts = { accounts: ApiBankAccount[] };
export type BankReviewCategory = 'dining' | 'groceries' | 'transit' | 'shopping' | 'other';
export type ApiBankTransaction = {
  id: string; accountId: string; accountName: string; institution: string; merchant: string; name: string;
  date: string; amountCents: number; pending: boolean; providerCategory: string | null;
  category: BankReviewCategory | null; excluded: boolean; note: string | null; reviewed: boolean; reviewedAt: number | null;
  linkedExpense: { id: string; title: string } | null;
  splits: { id: string; category: BankReviewCategory; amountCents: number }[];
};
export type TransactionReview = {
  category: BankReviewCategory | null; excluded: boolean; note: string | null; reviewed: boolean;
  splits: { category: BankReviewCategory; amountCents: number }[];
};

export const bankingApi = {
  accounts: () => apiRequest<Accounts>('/banking/accounts'),
  linkToken: (connectionId?: string) => apiRequest<{ linkToken: string }>('/banking/link-token', { method: 'POST', body: JSON.stringify(connectionId ? { connectionId } : {}) }),
  exchange: (publicToken: string) => apiRequest<Accounts>('/banking/exchange', { method: 'POST', body: JSON.stringify({ publicToken }) }),
  reauthenticated: (connectionId: string) => apiRequest<Accounts>(`/banking/connections/${connectionId}/reauthenticated`, { method: 'POST' }),
  update: (id: string, patch: { nickname?: string | null; hidden?: boolean }) => apiRequest<Accounts>(`/banking/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  disconnect: (connectionId: string) => apiRequest<void>(`/banking/connections/${connectionId}`, { method: 'DELETE' }),
  sync: () => apiRequest<Accounts & { added: number }>('/banking/sync', { method: 'POST' }),
  transactions: (status: 'all' | 'unreviewed' | 'reviewed' | 'excluded' = 'unreviewed', query = '') => {
    const params = new URLSearchParams({ status });
    if (query.trim()) params.set('query', query.trim());
    return apiRequest<{ transactions: ApiBankTransaction[] }>(`/banking/transactions?${params}`);
  },
  reviewTransaction: (id: string, review: TransactionReview) =>
    apiRequest<{ transaction: ApiBankTransaction }>(`/banking/transactions/${id}/review`, { method: 'PUT', body: JSON.stringify(review) }),
};

type PlaidHandler = { open: () => void; destroy: () => void };
type PlaidLink = { create: (config: { token: string; onSuccess: (publicToken: string) => void; onExit: () => void }) => PlaidHandler };
const scriptUrl = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';

function loadPlaid(): Promise<PlaidLink> {
  const existing = (window as unknown as { Plaid?: PlaidLink }).Plaid;
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = scriptUrl; script.async = true;
    script.onload = () => resolve((window as unknown as { Plaid: PlaidLink }).Plaid);
    script.onerror = () => reject(new Error('Could not load Plaid Link'));
    document.head.appendChild(script);
  });
}

/** Opens Plaid Link; resolves with a public token, or null if the user closed it. */
export async function openPlaidLink(linkToken: string): Promise<string | null> {
  const plaid = await loadPlaid();
  return new Promise(resolve => {
    const handler = plaid.create({
      token: linkToken,
      onSuccess: publicToken => { handler.destroy(); resolve(publicToken); },
      onExit: () => { handler.destroy(); resolve(null); },
    });
    handler.open();
  });
}
