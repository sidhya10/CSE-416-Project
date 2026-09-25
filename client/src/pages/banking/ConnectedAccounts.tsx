import { useState } from 'react';
import { formatCents } from '../expenses/split';
import { relativeTime } from '../../utils/dates';
import { LAST_SYNC_NEW_TRANSACTIONS, MENU_ACTIONS, initialAccounts, institutionInitial, type Account, type MenuAction } from './banking';
import './banking.css';

function RenameDialog({ initialName, onCancel, onSave }: { initialName: string; onCancel: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(initialName);
  return <div className="bank-dialog-backdrop" onKeyDown={event => { if (event.key === 'Escape') onCancel(); }}>
    <div className="bank-dialog" role="dialog" aria-modal="true" aria-labelledby="rename-account-title">
      <h2 id="rename-account-title">Rename account</h2>
      <label>ACCOUNT NAME<input autoFocus maxLength={40} value={name} onChange={event => setName(event.target.value)} /></label>
      <div><button type="button" onClick={onCancel}>Cancel</button>
        <button type="button" disabled={!name.trim()} onClick={() => onSave(name.trim())}>Save</button></div>
    </div>
  </div>;
}

function DisconnectDialog({ account, onCancel, onConfirm }: { account: Account; onCancel: () => void; onConfirm: () => void }) {
  return <div className="bank-dialog-backdrop" onKeyDown={event => { if (event.key === 'Escape') onCancel(); }}>
    <div className="bank-dialog danger" role="alertdialog" aria-modal="true" aria-labelledby="disconnect-title" aria-describedby="disconnect-description">
      <h2 id="disconnect-title">Disconnect {account.nickname}?</h2>
      <p id="disconnect-description">This removes the account and its cached balance from this preview. You can reconnect it later.</p>
      <div><button type="button" autoFocus onClick={onCancel}>Cancel</button>
        <button type="button" onClick={onConfirm}>Disconnect</button></div>
    </div>
  </div>;
}

export default function ConnectedAccounts({ onBack }: { onBack?: () => void }) {
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [pendingDisconnect, setPendingDisconnect] = useState<Account | null>(null);
  const [autoSync, setAutoSync] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState('');

  const renamingAccount = accounts.find(account => account.id === renamingId);
  const canSyncNow = accounts.some(account => account.status === 'synced' && !account.hidden);
  const hasRecentSync = accounts.some(account => account.status === 'synced' && account.syncedAt);

  const syncNow = () => {
    if (!canSyncNow || syncing) return;
    setSyncing(true);
    setNotice('');
    window.setTimeout(() => {
      setAccounts(previous => previous.map(account => account.status === 'synced' ? { ...account, syncedAt: Date.now() } : account));
      setSyncing(false);
      setNotice('Synced connected accounts.');
    }, 600);
  };

  const reauthenticate = (id: string) => {
    const target = accounts.find(account => account.id === id);
    setAccounts(previous => previous.map(account => account.id === id
      ? { ...account, status: 'synced', statusDetail: undefined, syncedAt: Date.now() } : account));
    setExpandedId(null);
    setNotice(`${target?.nickname ?? 'Account'} reconnected.`);
  };

  const toggleHide = (id: string) => {
    setAccounts(previous => previous.map(account => account.id === id ? { ...account, hidden: !account.hidden } : account));
    setExpandedId(null);
  };

  const runMenuAction = (account: Account, action: MenuAction) => {
    if (action === 'reauthenticate') { reauthenticate(account.id); return; }
    if (action === 'rename') { setRenamingId(account.id); setExpandedId(null); return; }
    if (action === 'hide') { toggleHide(account.id); return; }
    setPendingDisconnect(account); setExpandedId(null);
  };

  const connectAccount = () => setNotice('Connecting a new account opens Plaid Link in a modal/webview. This preview does not call Plaid yet.');

  return <main className="banking-workspace">
    <header className="bank-header"><button type="button" aria-label="Back" onClick={onBack}>‹</button>
      <div><h1>Connected accounts</h1><p>Securely sync transactions when you choose</p></div></header>

    <section className="bank-banner"><strong>Bank credentials stay with Plaid</strong>
      <small>The app stores encrypted connection tokens only.</small></section>

    {accounts.map(account => {
      const attention = account.status === 'needs-attention';
      const expanded = expandedId === account.id;
      return <div className={`bank-account-card${attention ? ' attention' : ''}`} key={account.id}>
        <div className="bank-account-row">
          <span className={`bank-avatar tone-${attention ? 'attention' : 'synced'}`} aria-hidden="true">{institutionInitial(account.institution)}</span>
          <span className="bank-account-copy">
            <strong>{account.nickname}</strong>
            <small>•••• {account.last4}{!attention && account.syncedAt ? ` · Synced ${relativeTime(account.syncedAt)}` : ''}</small>
          </span>
          <span className="bank-account-trailing">
            <b className={`bank-balance${account.balanceCents < 0 ? ' negative' : ''}`}>{formatCents(account.balanceCents)}</b>
            <button type="button" className="bank-menu-toggle" aria-label={`${account.nickname} actions`} aria-expanded={expanded}
              onClick={() => setExpandedId(expanded ? null : account.id)}>•••</button>
          </span>
        </div>

        {attention && <>
          <span className="bank-status-badge">Needs attention</span>
          <div className="bank-status-line"><small>{account.statusDetail}</small>
            <button type="button" className="bank-fix-button" onClick={() => reauthenticate(account.id)}>
              <span aria-hidden="true">↻</span> Fix connection</button></div>
        </>}
        {account.hidden && <span className="bank-hidden-badge">Hidden from budget</span>}

        {expanded && <div className="bank-menu" role="menu" aria-label={`${account.nickname} actions`}>
          {MENU_ACTIONS.map(item => <button type="button" role="menuitem" key={item.key}
            className={`bank-menu-item${item.tone === 'danger' ? ' danger' : ''}`} onClick={() => runMenuAction(account, item.key)}>
            <span className={`bank-menu-icon ${item.tone}`} aria-hidden="true">{item.icon}</span>
            <span>{item.key === 'hide' ? (account.hidden ? 'Unhide from budget' : 'Hide from budget') : item.label}</span>
          </button>)}
        </div>}
      </div>;
    })}

    <section className="bank-sync-card">
      <h2>Transaction sync</h2><p>Pull new transactions and refresh matches.</p>
      <div className="bank-sync-row">
        <button type="button" className="bank-sync-button" disabled={!canSyncNow || syncing} onClick={syncNow}>
          <span aria-hidden="true">↻</span>{syncing ? 'Syncing…' : 'Sync now'}</button>
        <label className="bank-auto-sync"><span>Automatic sync<small>{autoSync ? 'On' : 'Off'}</small></span>
          <span className="bank-switch"><input type="checkbox" checked={autoSync} onChange={event => setAutoSync(event.target.checked)} aria-label="Automatic sync" />
            <span className="bank-switch-track" aria-hidden="true" /></span>
        </label>
      </div>
    </section>

    <button type="button" className="bank-connect-button" onClick={connectAccount}>+ Connect another account</button>

    {notice && <p className="form-notice" role="status">{notice}</p>}
    {hasRecentSync && <p className="bank-caption">Last sync imported {LAST_SYNC_NEW_TRANSACTIONS} new transactions</p>}
    <p className="bank-caption">Connect another account opens Plaid Link in a modal/webview for implementation handoff.</p>

    {renamingAccount && <RenameDialog initialName={renamingAccount.nickname} onCancel={() => setRenamingId(null)}
      onSave={name => { setAccounts(previous => previous.map(account => account.id === renamingAccount.id ? { ...account, nickname: name } : account)); setRenamingId(null); }} />}
    {pendingDisconnect && <DisconnectDialog account={pendingDisconnect} onCancel={() => setPendingDisconnect(null)} onConfirm={() => {
      setAccounts(previous => previous.filter(account => account.id !== pendingDisconnect.id));
      setNotice(`${pendingDisconnect.nickname} disconnected.`);
      setPendingDisconnect(null);
    }} />}
  </main>;
}
