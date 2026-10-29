import { useEffect, useState } from 'react';
import { ApiError } from '../../api/client';
import { bankingApi, openPlaidLink } from '../../api/banking.api';
import { formatCents } from '../expenses/split';
import { relativeTime } from '../../utils/dates';
import { MENU_ACTIONS, institutionInitial, type Account, type MenuAction } from './banking';
import './banking.css';
import TransactionReviewCenter from './TransactionReviewCenter';

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
      <p id="disconnect-description">This revokes access at your bank and removes every account linked through this connection, along with its cached balance and imported transactions. You can reconnect it later.</p>
      <div><button type="button" autoFocus onClick={onCancel}>Cancel</button>
        <button type="button" onClick={onConfirm}>Disconnect</button></div>
    </div>
  </div>;
}

const message = (error: unknown) => error instanceof ApiError && error.status === 401 ? 'Sign in to manage bank connections.' : error instanceof Error ? error.message : 'Something went wrong';

export default function ConnectedAccounts({ onBack }: { onBack?: () => void }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [pendingDisconnect, setPendingDisconnect] = useState<Account | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [lastAdded, setLastAdded] = useState<number | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const renamingAccount = accounts.find(account => account.id === renamingId);
  const canSyncNow = accounts.some(account => account.status === 'synced' && !account.hidden);
  const hasRecentSync = lastAdded !== null && accounts.some(account => account.status === 'synced' && account.syncedAt);

  useEffect(() => {
    let active = true;
    bankingApi.accounts()
      .then(result => { if (active) setAccounts(result.accounts); })
      .catch(error => { if (active) setNotice(message(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  // Runs an API action with a shared busy flag; failures surface as a notice.
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setNotice('');
    try { await action(); } catch (error) { setNotice(message(error)); } finally { setBusy(false); }
  };

  const syncNow = () => run(async () => {
    if (!canSyncNow) return;
    const result = await bankingApi.sync();
    setAccounts(result.accounts); setLastAdded(result.added); setNotice('Synced connected accounts.');
  });

  const reauthenticate = (account: Account) => { setExpandedId(null); return run(async () => {
    const { linkToken } = await bankingApi.linkToken(account.connectionId);
    if (!await openPlaidLink(linkToken)) return;
    setAccounts((await bankingApi.reauthenticated(account.connectionId)).accounts);
    setNotice(`${account.nickname} reconnected.`);
  }); };

  const toggleHide = (account: Account) => { setExpandedId(null); return run(async () => {
    setAccounts((await bankingApi.update(account.id, { hidden: !account.hidden })).accounts);
  }); };

  const runMenuAction = (account: Account, action: MenuAction) => {
    if (action === 'reauthenticate') { void reauthenticate(account); return; }
    if (action === 'rename') { setRenamingId(account.id); setExpandedId(null); return; }
    if (action === 'hide') { void toggleHide(account); return; }
    setPendingDisconnect(account); setExpandedId(null);
  };

  const connectAccount = () => run(async () => {
    const { linkToken } = await bankingApi.linkToken();
    const publicToken = await openPlaidLink(linkToken);
    if (!publicToken) return;
    setAccounts((await bankingApi.exchange(publicToken)).accounts);
    setNotice('Account connected.');
  });

  if (reviewing) return <TransactionReviewCenter onBack={() => setReviewing(false)} />;

  return <main className="banking-workspace">
    <header className="bank-header"><button type="button" aria-label="Back" onClick={onBack}>‹</button>
      <div><h1>Connected accounts</h1><p>Syncs at sign-in or whenever you choose</p></div></header>

    <section className="bank-banner"><strong>Bank credentials stay with Plaid</strong>
      <small>The app stores encrypted connection tokens only.</small></section>

    {loading && <p className="bank-caption">Loading accounts…</p>}
    {!loading && accounts.length === 0 && <p className="bank-caption">No accounts connected yet.</p>}
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
            <button type="button" className="bank-fix-button" onClick={() => void reauthenticate(account)}>
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
      <h2>Transaction sync</h2><p>New transactions are pulled after every successful login.</p>
      <div className="bank-sync-row">
        <button type="button" className="bank-sync-button" disabled={!canSyncNow || busy} onClick={() => void syncNow()}>
          <span aria-hidden="true">↻</span>{busy ? 'Working…' : 'Sync now'}</button>
        <label className="bank-auto-sync"><span>Sync at login<small>On</small></span>
          <span className="bank-switch"><input type="checkbox" checked readOnly disabled aria-label="Sync at login enabled" />
            <span className="bank-switch-track" aria-hidden="true" /></span>
        </label>
      </div>
    </section>

    <button type="button" className="bank-review-button" onClick={() => setReviewing(true)}><span><strong>Review transactions</strong><small>Categorize, split, exclude, and add notes</small></span><b aria-hidden="true">›</b></button>

    <button type="button" className="bank-connect-button" disabled={busy} onClick={() => void connectAccount()}>+ Connect another account</button>

    {notice && <p className="form-notice" role="status">{notice}</p>}
    {hasRecentSync && <p className="bank-caption">Last sync imported {lastAdded} new transactions</p>}

    {renamingAccount && <RenameDialog initialName={renamingAccount.nickname} onCancel={() => setRenamingId(null)}
      onSave={name => { setRenamingId(null); void run(async () => { setAccounts((await bankingApi.update(renamingAccount.id, { nickname: name })).accounts); }); }} />}
    {pendingDisconnect && <DisconnectDialog account={pendingDisconnect} onCancel={() => setPendingDisconnect(null)} onConfirm={() => {
      const target = pendingDisconnect; setPendingDisconnect(null);
      void run(async () => {
        await bankingApi.disconnect(target.connectionId);
        setAccounts(previous => previous.filter(account => account.connectionId !== target.connectionId));
        setNotice(`${target.institution} disconnected.`);
      });
    }} />}
  </main>;
}
