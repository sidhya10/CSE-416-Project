import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';

type Profile = {
  name: string;
  username: string;
  birthday: string;
  bio: string;
  photo: string | null;
};

type Screen = 'settings' | 'edit' | 'account' | 'notifications' | 'appearance' | 'privacy' | 'help';

const sampleProfile: Profile = {
  name: 'Vivian Zheng',
  username: 'vivianzheng',
  birthday: '2004-01-18',
  bio: 'Food and travel enthusiast',
  photo: null,
};

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

export default function ProfileSettings({ onLogout, onRootChange }: {
  onLogout: () => void;
  onRootChange: (atRoot: boolean) => void;
}) {
  const [screen, setScreen] = useState<Screen>('settings');
  const [profile, setProfile] = useState<Profile>(sampleProfile);
  const [draft, setDraft] = useState<Profile>(sampleProfile);
  const [message, setMessage] = useState('');
  const [theme, setTheme] = useState('System');
  const [reminders, setReminders] = useState(true);
  const photoInput = useRef<HTMLInputElement>(null);

  const open = (next: Screen) => { setMessage(''); setScreen(next); onRootChange(next === 'settings'); };
  const edit = () => { setDraft(profile); open('edit'); };
  const back = () => open('settings');
  const update = (field: keyof Pick<Profile, 'name' | 'username' | 'birthday' | 'bio'>, value: string) =>
    setDraft(previous => ({ ...previous, [field]: value }));
  const save = (event: FormEvent) => {
    event.preventDefault();
    setProfile({ ...draft, name: draft.name.trim(), username: draft.username.trim().replace(/^@/, ''), bio: draft.bio.trim() });
    back();
  };
  const selectPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
      setMessage('Choose an image smaller than 5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setDraft(previous => ({ ...previous, photo: typeof reader.result === 'string' ? reader.result : null }));
    reader.readAsDataURL(file);
  };

  const avatar = (item: Profile, large = false) => <span className={large ? 'profile-avatar large' : 'profile-avatar'}>
    {item.photo ? <img src={item.photo} alt="" /> : item.name.trim().charAt(0).toUpperCase() || '?'}
    <span className="avatar-plus" aria-hidden="true">+</span>
  </span>;

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
      <h2 className="settings-section-heading preferences-heading">Preferences</h2>
      <SettingsRow title="Notifications" subtitle="Budgets, settlements, and reminders" onClick={() => open('notifications')} />
      <SettingsRow title="Appearance" subtitle="System theme" action={theme} onClick={() => open('appearance')} />
      <SettingsRow title="Privacy & security" subtitle="Permissions and connected data" onClick={() => open('privacy')} />
      <SettingsRow title="Help & legal" subtitle="Support, privacy policy, and terms" onClick={() => open('help')} />
      <button className="logout-button" type="button" onClick={onLogout}>Log out</button>
    </>}
    {screen === 'edit' && <>
      <header className="edit-header">
        <button type="button" onClick={back}>Cancel</button><h1>Edit profile</h1>
        <button type="submit" form="edit-profile-form">Save</button>
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
      <p className="profile-footnote">Email and login methods are managed in Account Settings.</p>
    </>}
    {screen === 'account' && <>
      <header className="subscreen-heading"><button type="button" onClick={back} aria-label="Back to Settings">‹</button>
        <h1>Account settings</h1><p>Login methods and account recovery</p></header>
      <h2 className="settings-overline">CONTACT</h2>
      <SettingsRow title="Email" subtitle="Available after account login" action="Locked" />
      <SettingsRow title="Phone number" subtitle="Not added" onClick={() => setMessage('Phone number management requires an account.')} />
      <h2 className="settings-overline spaced">CONNECTED ACCOUNTS</h2>
      <div className="connected-card"><span className="connected-icon">G</span><span className="setting-row-copy"><strong>Google</strong><small>Not connected in preview</small></span><span>Not connected</span></div>
      <button className="connect-google" type="button" onClick={() => setMessage('Google account linking requires authentication.')}>+&nbsp; Connect Google account</button>
      <h2 className="settings-overline spaced">SECURITY</h2>
      <SettingsRow title="Password" subtitle="Available after account login" onClick={() => setMessage('Password changes require an account.')} />
      <SettingsRow title="Two-step verification" subtitle="Not enabled" onClick={() => setMessage('Two-step verification requires an account.')} />
      <button className="delete-account" type="button" onClick={() => setMessage('Account deletion is unavailable in preview. No account data has been created.')}>Delete account <span aria-hidden="true">›</span></button>
      {message && <p className="setting-notice" role="status">{message}</p>}
    </>}
    {['notifications', 'appearance', 'privacy', 'help'].includes(screen) && <>
      <header className="subscreen-heading"><button type="button" onClick={back} aria-label="Back to Settings">‹</button>
        <h1>{({ notifications: 'Notifications', appearance: 'Appearance', privacy: 'Privacy & security', help: 'Help & legal' } as Record<string, string>)[screen]}</h1></header>
      {screen === 'notifications' && <label className="setting-row preference-control"><span className="setting-row-copy"><strong>Reminders</strong><small>Preview preference for budgets and settlements</small></span>
        <input type="checkbox" checked={reminders} onChange={event => setReminders(event.target.checked)} /></label>}
      {screen === 'appearance' && <fieldset className="appearance-options"><legend>Theme preference</legend>
        {['System', 'Light', 'Dark'].map(option => <label key={option}><input type="radio" name="theme" value={option} checked={theme === option}
          onChange={() => setTheme(option)} />{option}</label>)}
        <p>Theme selection is a preview preference; app-wide themes are not connected yet.</p>
      </fieldset>}
      {screen === 'privacy' && <p className="setting-info">Permissions and connected data will appear here when account and bank connections are available.</p>}
      {screen === 'help' && <p className="setting-info">Support and legal documents will be linked here when they are available.</p>}
    </>}
  </main>;
}
