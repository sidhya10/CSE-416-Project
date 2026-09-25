export type AccountStatus = 'synced' | 'needs-attention';
export type MenuAction = 'reauthenticate' | 'rename' | 'hide' | 'disconnect';

export type Account = {
  id: string;
  institution: string;
  nickname: string;
  last4: string;
  balanceCents: number;
  status: AccountStatus;
  statusDetail?: string;
  syncedAt: number | null;
  hidden: boolean;
};

// Sample fixture data. Plaid is UI-only here — see the "Bank credentials stay with
// Plaid" banner; there is no live Link/webview integration behind these screens yet.
export const initialAccounts: Account[] = [
  { id: 'chase-checking', institution: 'Chase', nickname: 'Chase Total Checking', last4: '1842', balanceCents: 184260, status: 'synced', syncedAt: Date.now() - 2 * 60000, hidden: false },
  { id: 'capital-one-savorone', institution: 'Capital One', nickname: 'Capital One SavorOne', last4: '7741', balanceCents: -32844, status: 'needs-attention', statusDetail: 'Consent expired', syncedAt: null, hidden: false },
];

export const LAST_SYNC_NEW_TRANSACTIONS = 6;
export const MAX_ACCOUNTS = 6;

export const institutionInitial = (institution: string) => institution.trim().charAt(0).toUpperCase() || '?';

export const MENU_ACTIONS: { key: MenuAction; label: string; icon: string; tone: 'positive' | 'neutral' | 'danger' }[] = [
  { key: 'reauthenticate', label: 'Re-authenticate', icon: '↻', tone: 'positive' },
  { key: 'rename', label: 'Rename account', icon: '✎', tone: 'neutral' },
  { key: 'hide', label: 'Hide from budget', icon: '⊘', tone: 'neutral' },
  { key: 'disconnect', label: 'Disconnect account', icon: '🗑', tone: 'danger' },
];
