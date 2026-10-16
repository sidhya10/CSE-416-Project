import type { ApiBankAccount } from '../../api/banking.api';

export type AccountStatus = 'synced' | 'needs-attention';
export type MenuAction = 'reauthenticate' | 'rename' | 'hide' | 'disconnect';

export type Account = ApiBankAccount;

export const institutionInitial = (institution: string) => institution.trim().charAt(0).toUpperCase() || '?';

export const MENU_ACTIONS: { key: MenuAction; label: string; icon: string; tone: 'positive' | 'neutral' | 'danger' }[] = [
  { key: 'reauthenticate', label: 'Re-authenticate', icon: '↻', tone: 'positive' },
  { key: 'rename', label: 'Rename account', icon: '✎', tone: 'neutral' },
  { key: 'hide', label: 'Hide from budget', icon: '⊘', tone: 'neutral' },
  { key: 'disconnect', label: 'Disconnect account', icon: '🗑', tone: 'danger' },
];
