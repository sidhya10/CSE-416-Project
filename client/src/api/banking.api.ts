import { apiRequest } from './client';

export type ApiBankAccount = {
  id: string; connectionId: string; institution: string; nickname: string; last4: string; balanceCents: number;
  hidden: boolean; status: 'synced' | 'needs-attention'; statusDetail?: string; syncedAt: number | null;
};
type Accounts = { accounts: ApiBankAccount[] };

export const bankingApi = {
  accounts: () => apiRequest<Accounts>('/banking/accounts'),
  linkToken: (connectionId?: string) => apiRequest<{ linkToken: string }>('/banking/link-token', { method: 'POST', body: JSON.stringify(connectionId ? { connectionId } : {}) }),
  exchange: (publicToken: string) => apiRequest<Accounts>('/banking/exchange', { method: 'POST', body: JSON.stringify({ publicToken }) }),
  reauthenticated: (connectionId: string) => apiRequest<Accounts>(`/banking/connections/${connectionId}/reauthenticated`, { method: 'POST' }),
  update: (id: string, patch: { nickname?: string | null; hidden?: boolean }) => apiRequest<Accounts>(`/banking/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  disconnect: (connectionId: string) => apiRequest<void>(`/banking/connections/${connectionId}`, { method: 'DELETE' }),
  sync: () => apiRequest<Accounts & { added: number }>('/banking/sync', { method: 'POST' }),
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
