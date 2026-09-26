import { useState } from 'react';
import receiptLogo from './assets/receipt-split-logo.png';
import ProfileSettings from './pages/settings/ProfileSettings';
import GroupsWorkspace from './pages/groups/GroupsWorkspace';
import CategoryBudgets from './pages/budgets/CategoryBudgets';
import HomeDashboard from './pages/dashboard/HomeDashboard';

type Tab = 'Home' | 'Budget' | 'Groups' | 'Profile';
type AuthView = 'login' | 'signup';
const tabs: { label: Tab; glyph: string }[] = [
  { label: 'Home', glyph: '⌂' },
  { label: 'Budget', glyph: '▥' },
  { label: 'Groups', glyph: '◎' },
  { label: 'Profile', glyph: '●' },
];

export default function App() {
  const [view, setView] = useState<AuthView>('login');
  const [preview, setPreview] = useState(false);
  const [tab, setTab] = useState<Tab>('Home');
  const [notice, setNotice] = useState('');
  const [profileAtRoot, setProfileAtRoot] = useState(true);
  const [groupsAtRoot, setGroupsAtRoot] = useState(true);

  const changeView = (next: AuthView) => { setNotice(''); setView(next); };
  const unavailable = (service: string) => setNotice(`${service} is not connected yet. Explore the app preview below.`);

  return <div className="device">
    {preview ? <>
      {tab !== 'Profile' && tab !== 'Groups' && tab !== 'Budget' && tab !== 'Home' && <main className="placeholder-page"><h1>{tab}</h1></main>}
      <div hidden={tab !== 'Home'} className="profile-content">
        <HomeDashboard />
      </div>
      <div hidden={tab !== 'Budget'} className="profile-content">
        <CategoryBudgets />
      </div>
      <div hidden={tab !== 'Profile'} className="profile-content">
        <ProfileSettings onRootChange={setProfileAtRoot} onLogout={() => {
          setPreview(false); setTab('Home'); setProfileAtRoot(true); setNotice('');
        }} />
      </div>
      <div hidden={tab !== 'Groups'} className="profile-content">
        <GroupsWorkspace onRootChange={setGroupsAtRoot} />
      </div>
      {(tab === 'Home' || tab === 'Budget' || (tab === 'Profile' && profileAtRoot) || (tab === 'Groups' && groupsAtRoot)) && <nav className="bottom-nav" aria-label="Main navigation">
        {tabs.map(({ label, glyph }) => <button key={label} type="button" className={tab === label ? 'tab active' : 'tab'}
          aria-current={tab === label ? 'page' : undefined} onClick={() => setTab(label)}>
          <span className="tab-glyph" aria-hidden="true">{glyph}</span><span>{label}</span>
        </button>)}
      </nav>}
    </> : view === 'login' ? <main className="login-screen">
      <div className="login-intro">
        <div className="logo-tile"><img src={receiptLogo} width="52" height="52" alt="" /></div>
        <h1>Welcome back</h1>
        <p>Keep personal and shared spending in sync.</p>
      </div>
      <form className="login-form" onSubmit={event => { event.preventDefault(); unavailable('Account login'); }}>
        <label>EMAIL<input type="email" name="email" autoComplete="email" required placeholder="you@example.com" /></label>
        <label>PASSWORD<input type="password" name="password" autoComplete="current-password" required placeholder="••••••••" /></label>
        <button type="button" className="forgot-link" onClick={() => unavailable('Password reset')}>Forgot password?</button>
        <button type="submit" className="primary-button">Log in</button>
      </form>
      <div className="divider"><span>or</span></div>
      <button type="button" className="google-button" onClick={() => unavailable('Google sign-in')}>
        <span className="google-badge" aria-hidden="true">G</span>Continue with Google
      </button>
      <p className="switch-auth">New here? <button type="button" onClick={() => changeView('signup')}>Create an account</button></p>
      <p className="terms">By continuing, you agree to the Terms and Privacy Policy.</p>
      {notice && <p className="form-notice" role="status">{notice}</p>}
      <button className="preview-link" type="button" onClick={() => setPreview(true)}>Explore app preview →</button>
    </main> : <main className="signup-screen">
      <header className="signup-intro">
        <button type="button" className="back-button" aria-label="Back to log in" onClick={() => changeView('login')}>‹</button>
        <h1>Create your account</h1>
        <p>Start budgeting alone or with friends.</p>
      </header>
      <button type="button" className="google-button" onClick={() => unavailable('Google sign-up')}>
        <span className="google-badge" aria-hidden="true">G</span>Sign up with Google
      </button>
      <p className="manual-divider">or register manually</p>
      <form className="signup-form" onSubmit={event => { event.preventDefault(); unavailable('Account registration'); }}>
        <label>NAME<input name="name" autoComplete="name" required placeholder="Vivian Zheng" /></label>
        <label>USERNAME<input name="username" autoComplete="username" required placeholder="vivianzheng" /></label>
        <label>EMAIL<input type="email" name="email" autoComplete="email" required placeholder="you@example.com" /></label>
        <label>PASSWORD<input type="password" name="password" autoComplete="new-password" minLength={8}
          pattern="(?=.*[0-9]).{8,}" required title="Use at least 8 characters with a number" placeholder="••••••••" /></label>
        <p className="password-hint">Use at least 8 characters with a number.</p>
        <button type="submit" className="primary-button">Create account</button>
      </form>
      <p className="switch-auth">Already have an account? <button type="button" onClick={() => changeView('login')}>Log in</button></p>
      {notice && <p className="form-notice" role="status">{notice}</p>}
      <button className="preview-link" type="button" onClick={() => setPreview(true)}>Explore app preview →</button>
    </main>}
  </div>;
}
