import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useAppearance } from '../../appearance';
import { authApi } from '../../api/auth.api';
import { ApiError } from '../../api/client';
import type { AppUser } from '../../api/types';
import { usersApi } from '../../api/users.api';
import GoogleSignInButton from '../../components/auth/GoogleSignInButton';
import ConnectedAccounts from '../banking/ConnectedAccounts';

type Profile = Pick<AppUser, 'name' | 'username' | 'birthday' | 'bio' | 'photoUrl'>;

type Screen = 'settings' | 'password' | 'edit' | 'account' | 'banking' | 'notifications' | 'appearance' | 'privacy' | 'help';

function SettingsRow({ title, subtitle, action, onClick }: {
  title: string;
  subtitle: string;
  action?: string;
  onClick?: () => void;
}) {
  const content = <><span className="setting-row-copy"><strong>{title}</strong><small>{subtitle}</small></span>
    <span className={action ? 'setting-row-action' : 'setting-row-chevron'} aria-hidden="true">{action ?? '›'}</span></>;
  return onClick
    ? <button type="button" className="setting-row" onClick={onClick}>{content}</button>
    : <div className="setting-row">{content}</div>;
}

export default function ProfileSettings({ user, onUserChange, onLogout, onRootChange }: {
  user: AppUser;
  onUserChange: (user: AppUser) => void;
  onLogout: () => void;
  onRootChange: (atRoot: boolean) => void;
}) {
  const [screen, setScreen] = useState<Screen>('settings');
  const profile = { name: user.name, username: user.username, birthday: user.birthday, bio: user.bio, photoUrl: user.photoUrl };
  const [draft, setDraft] = useState<Profile>(profile);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useAppearance();
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [reminders, setReminders] = useState(true);
  const photoInput = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(profile), [user.name, user.username, user.birthday, user.bio, user.photoUrl]);

  const open = (next: Screen) => { setMessage(''); setPasswords({ current: '', next: '', confirm: '' }); setScreen(next); onRootChange(next === 'settings'); };
  const edit = () => { setDraft(profile); open('edit'); };
  const back = () => open('settings');
  const update = (field: keyof Pick<Profile, 'name' | 'username' | 'birthday' | 'bio'>, value: string) =>
    setDraft(previous => ({ ...previous, [field]: value }));
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setMessage('');
    try {
      const result = await usersApi.updateMe({ ...draft, name: draft.name.trim(), username: draft.username.trim().replace(/^@/, ''), bio: draft.bio.trim() });
      onUserChange(result.user); back();
    } catch (error) { setMessage(error instanceof ApiError ? error.message : 'Could not update your profile.'); }
    finally { setSaving(false); }
  };
  const selectPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
      setMessage('Choose an image smaller than 5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setDraft(previous => ({ ...previous, photoUrl: typeof reader.result === 'string' ? reader.result : null }));
    reader.readAsDataURL(file);
  };

  const avatar = (item: Profile, large = false) => <span className={large ? 'profile-avatar large' : 'profile-avatar'}>
    {item.photoUrl ? <img src={item.photoUrl} alt="" /> : item.name.trim().charAt(0).toUpperCase() || '?'}
    <span className="avatar-plus" aria-hidden="true">+</span>
  </span>;

  if (screen === 'banking') return <ConnectedAccounts onBack={back} />;

  return <main className="settings-screen">
    {screen === 'settings' && <>
      <header className="settings-heading"><h1>Settings</h1><p>Profile, account, and app preferences</p></header>
      <section className="profile-summary" aria-label="Profile summary">
        <button className="avatar-button" type="button" onClick={edit} aria-label="Edit profile photo">{avatar(profile)}</button>
        <div className="profile-summary-copy">
          <strong>{profile.name}</strong><span>@{profile.username}</span><small>{profile.bio}</small>
          <button type="button" onClick={edit}>Edit profile&nbsp; ›</button>
        </div>
      </section>
      <h2 className="settings-section-heading">Account</h2>
      <SettingsRow title="Account settings" subtitle="Email, Google, phone, and password" onClick={() => open('account')} />
      <SettingsRow title="Bank connections" subtitle="Linked banks, balances, and transaction sync" onClick={() => open('banking')} />
      <h2 className="settings-section-heading preferences-heading">Preferences</h2>
      <SettingsRow title="Notifications" subtitle="Budgets, settlements, and reminders" onClick={() => open('notifications')} />
      <SettingsRow title="Appearance" subtitle={theme === 'System' ? 'Follow your device appearance' : `${theme} theme`} action={theme} onClick={() => open('appearance')} />
      <SettingsRow title="Privacy & security" subtitle="Permissions and connected data" onClick={() => open('privacy')} />
      <SettingsRow title="Help & legal" subtitle="Support, privacy policy, and terms" onClick={() => open('help')} />
      <button className="logout-button" type="button" onClick={onLogout}>Log out</button>
    </>}
    {screen === 'edit' && <>
      <header className="edit-header">
        <button type="button" onClick={back}>Cancel</button><h1>Edit profile</h1>
        <button type="submit" form="edit-profile-form" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </header>
      <div className="photo-editor">
        <button className="avatar-button" type="button" onClick={() => photoInput.current?.click()} aria-label="Change profile photo">{avatar(draft, true)}</button>
        <button type="button" onClick={() => photoInput.current?.click()}>Change profile photo</button>
        <input ref={photoInput} type="file" accept="image/*" onChange={selectPhoto} hidden aria-label="Upload profile photo" />
      </div>
      {message && <p className="setting-notice" role="status">{message}</p>}
      <form id="edit-profile-form" className="profile-form" onSubmit={save}>
        <label>USERNAME<input value={draft.username} onChange={event => update('username', event.target.value)}
          pattern="[A-Za-z0-9_]+" title="Use letters, numbers, and underscores" required maxLength={30} autoComplete="username" /></label>
        <label>NAME<input value={draft.name} onChange={event => update('name', event.target.value)}
          required maxLength={80} autoComplete="name" /></label>
        <label>BIRTHDAY<input type="date" value={draft.birthday} onChange={event => update('birthday', event.target.value)}
          max={new Date().toISOString().slice(0, 10)} /></label>
        <label>BIO<textarea value={draft.bio} onChange={event => update('bio', event.target.value)} maxLength={160} /></label>
      </form>
      <p className="bio-note">Your bio is visible to friends and group members.</p>
      <p className="profile-footnote">Email and phone number are locked after registration.</p>
    </>}
    {screen === 'password' && <>
      <header className="subscreen-heading"><button type="button" onClick={() => open('account')} aria-label="Back to Account settings">‹</button><h1>Change password</h1></header>
      {user.hasPassword ? <form className="profile-form password-form" onSubmit={async event => {
        event.preventDefault();
        if (saving) return;
        if (passwords.next !== passwords.confirm) { setMessage('New passwords do not match.'); return; }
        if (passwords.current === passwords.next) { setMessage('Choose a different new password.'); return; }
        if (new TextEncoder().encode(passwords.next).length > 72) { setMessage('New password must be at most 72 bytes.'); return; }
        setSaving(true); setMessage('');
        try {
          await authApi.changePassword(passwords.current, passwords.next, passwords.confirm);
          open('account'); setMessage('Password changed successfully.');
        } catch (error) { setMessage(error instanceof ApiError ? error.message : 'Could not change your password. Try again.'); }
        finally { setSaving(false); }
      }}>
        <label>Current password<input type="password" autoComplete="current-password" required disabled={saving} value={passwords.current} onChange={event => setPasswords({ ...passwords, current: event.target.value })} /></label>
        <label>New password<input type="password" autoComplete="new-password" required minLength={8} maxLength={72} pattern=".*[0-9].*" title="Use at least 8 characters, including a number" disabled={saving} value={passwords.next} onChange={event => setPasswords({ ...passwords, next: event.target.value })} /></label>
        <label>Confirm new password<input type="password" autoComplete="new-password" required disabled={saving} value={passwords.confirm} onChange={event => setPasswords({ ...passwords, confirm: event.target.value })} /></label>
        <p className="setting-info">Use at least 8 characters, including a number.</p>
        <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Updating…' : 'Update password'}</button>
        <button className="password-cancel" type="button" disabled={saving} onClick={() => open('account')}>Cancel</button>
      </form> : <p className="setting-info">This account uses Google sign-in and has no password to change. Manage your Google password through your Google account.</p>}
      {message && <p className="setting-notice" role="status">{message}</p>}
    </>}
    {screen === 'account' && <>
      <header className="subscreen-heading"><button type="button" onClick={back} aria-label="Back to Settings">‹</button>
        <h1>Account settings</h1><p>Login methods and account recovery</p></header>
      <h2 className="settings-overline">CONTACT</h2>
      <SettingsRow title="Email" subtitle={user.email} action="Locked" />
      <SettingsRow title="Phone number" subtitle={user.phone ?? 'Not added at registration'} action="Locked" />
      <h2 className="settings-overline spaced">CONNECTED ACCOUNTS</h2>
      <div className="connected-card"><span className="connected-icon">G</span><span className="setting-row-copy"><strong>Google</strong><small>{user.hasGoogle ? 'Connected login method' : 'Not connected'}</small></span><span>{user.hasGoogle ? 'Connected' : 'Not connected'}</span></div>
      {!user.hasGoogle && <GoogleSignInButton intent="link" onSuccess={updated => { onUserChange(updated); setMessage('Google account connected. You can sign in with Google or your existing password.'); }} />}
      <h2 className="settings-overline spaced">SECURITY</h2>
      <SettingsRow title="Password" subtitle={user.hasPassword ? 'Password login enabled' : 'Google sign-in only'} onClick={() => open('password')} />
      <SettingsRow title="Two-step verification" subtitle="Not enabled" onClick={() => setMessage('Two-step verification requires an account.')} />
      <button className="delete-account" type="button" onClick={() => {
        if (!window.confirm('Delete your account and friendships permanently?')) return;
        void usersApi.deleteMe().then(onLogout).catch(error => setMessage(error instanceof ApiError ? error.message : 'Could not delete your account.'));
      }}>Delete account <span aria-hidden="true">›</span></button>
      {message && <p className="setting-notice" role="status">{message}</p>}
    </>}
    {['notifications', 'appearance', 'privacy', 'help'].includes(screen) && <>
      <header className="subscreen-heading"><button type="button" onClick={back} aria-label="Back to Settings">‹</button>
        <h1>{({ notifications: 'Notifications', appearance: 'Appearance', privacy: 'Privacy & security', help: 'Help & legal' } as Record<string, string>)[screen]}</h1></header>
      {screen === 'notifications' && <label className="setting-row preference-control"><span className="setting-row-copy"><strong>Reminders</strong><small>Preview preference for budgets and settlements</small></span>
        <input type="checkbox" checked={reminders} onChange={event => setReminders(event.target.checked)} /></label>}
      {screen === 'appearance' && <fieldset className="appearance-options"><legend>Theme preference</legend>
        {(['System', 'Light', 'Dark'] as const).map(option => <label key={option}><input type="radio" name="theme" value={option} checked={theme === option}
          onChange={() => setTheme(option)} />{option}</label>)}
        <p>System follows your device. Your choice is saved on this browser.</p>
      </fieldset>}
      {screen === 'privacy' && <p className="setting-info">Permissions and connected data will appear here when account and bank connections are available.</p>}
      {screen === 'help' && <p className="setting-info">Support and legal documents will be linked here when they are available.</p>}
    </>}
  </main>;
}
