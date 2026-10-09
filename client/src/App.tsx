import { useEffect, useRef, useState, type FormEvent } from 'react';
import receiptLogo from './assets/receipt-split-logo.png';
import { authApi } from './api/auth.api';
import { ApiError } from './api/client';
import type { AppUser } from './api/types';
import ProfileSettings from './pages/settings/ProfileSettings';
import GroupsWorkspace from './pages/groups/GroupsWorkspace';
import CategoryBudgets from './pages/budgets/CategoryBudgets';
import WhatIfSimulator from './pages/budgets/WhatIfSimulator';
import HomeDashboard from './pages/dashboard/HomeDashboard';
import type { FriendFixture, GroupFixture } from './pages/groups/GroupsWorkspace';

type Tab = 'Home' | 'Budget' | 'Groups' | 'Profile';
type AuthView = 'login' | 'signup';
const tabs: { label: Tab; glyph: string }[] = [
  { label: 'Home', glyph: '⌂' }, { label: 'Budget', glyph: '▥' },
  { label: 'Groups', glyph: '◎' }, { label: 'Profile', glyph: '●' },
];

declare global {
  interface Window {
    google?: { accounts: { id: { initialize: (options: { client_id: string; callback: (result: { credential: string }) => void }) => void; prompt: () => void } } };
  }
}

export default function App({ initialUser, groupFixtures, friendFixtures }: {
  initialUser?: AppUser;
  groupFixtures?: GroupFixture[];
  friendFixtures?: FriendFixture[];
} = {}) {
  const [view, setView] = useState<AuthView>('login');
  const [user, setUser] = useState<AppUser | null>(initialUser ?? null);
  const [loading, setLoading] = useState(!initialUser);
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState<Tab>('Home');
  const [notice, setNotice] = useState('');
  const [profileAtRoot, setProfileAtRoot] = useState(true);
  const [groupsAtRoot, setGroupsAtRoot] = useState(true);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [simulatorVisited, setSimulatorVisited] = useState(false);
  const googleReady = useRef(false);

  useEffect(() => {
    if (initialUser) return;
    authApi.me().then(result => setUser(result.user)).catch(() => undefined).finally(() => setLoading(false));
  }, [initialUser]);
  useEffect(() => {
    if (!import.meta.env.VITE_GOOGLE_CLIENT_ID || document.querySelector('script[data-google-identity]')) return;
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.dataset.googleIdentity = 'true';
    document.head.appendChild(script);
  }, []);

  const changeView = (next: AuthView) => { setNotice(''); setView(next); };
  const handleError = (error: unknown) => setNotice(error instanceof ApiError ? error.message : 'Unable to reach the server. Try again.');
  const authenticate = async (work: () => Promise<{ user: AppUser }>) => {
    setNotice(''); setSubmitting(true);
    try { setUser((await work()).user); setTab('Home'); }
    catch (error) { handleError(error); }
    finally { setSubmitting(false); }
  };
  const login = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void authenticate(() => authApi.login(String(values.get('email')), String(values.get('password'))));
  };
  const register = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void authenticate(() => authApi.register({
      name: String(values.get('name')), username: String(values.get('username')), email: String(values.get('email')),
      phone: String(values.get('phone') || '') || undefined, password: String(values.get('password')),
    }));
  };
  const googleLogin = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) { setNotice('Google sign-in needs VITE_GOOGLE_CLIENT_ID. Email login is ready now.'); return; }
    if (!window.google) { setNotice('Google sign-in is still loading. Try again in a moment.'); return; }
    if (!googleReady.current) {
      window.google.accounts.id.initialize({ client_id: clientId, callback: result => void authenticate(() => authApi.google(result.credential)) });
      googleReady.current = true;
    }
    window.google.accounts.id.prompt();
  };
  const logout = async () => {
    try { await authApi.logout(); }
    finally { setUser(null); setTab('Home'); setProfileAtRoot(true); setNotice(''); }
  };

  if (loading) return <div className="device"><main className="login-screen"><p className="form-notice" role="status">Loading your account…</p></main></div>;

  return <div className="device">
    {user ? <>
      <div hidden={tab !== 'Home'} className="profile-content"><HomeDashboard /></div>
      <div hidden={tab !== 'Budget' || simulatorOpen} className="profile-content"><CategoryBudgets onOpenSimulator={() => { setSimulatorVisited(true); setSimulatorOpen(true); }} /></div>
      <div hidden={tab !== 'Budget' || !simulatorOpen} className="profile-content">{simulatorVisited && <WhatIfSimulator onBack={() => setSimulatorOpen(false)} />}</div>
      <div hidden={tab !== 'Profile'} className="profile-content"><ProfileSettings user={user} onUserChange={setUser} onRootChange={setProfileAtRoot} onLogout={() => void logout()} /></div>
      <div hidden={tab !== 'Groups'} className="profile-content"><GroupsWorkspace onRootChange={setGroupsAtRoot} initialGroupsData={groupFixtures} initialFriendsData={friendFixtures} /></div>
      {(tab === 'Home' || (tab === 'Budget' && !simulatorOpen) || (tab === 'Profile' && profileAtRoot) || (tab === 'Groups' && groupsAtRoot)) && <nav className="bottom-nav" aria-label="Main navigation">
        {tabs.map(({ label, glyph }) => <button key={label} type="button" className={tab === label ? 'tab active' : 'tab'} aria-current={tab === label ? 'page' : undefined} onClick={() => setTab(label)}><span className="tab-glyph" aria-hidden="true">{glyph}</span><span>{label}</span></button>)}
      </nav>}
    </> : view === 'login' ? <main className="login-screen">
      <div className="login-intro"><div className="logo-tile"><img src={receiptLogo} width="52" height="52" alt="" /></div><h1>Welcome back</h1><p>Keep personal and shared spending in sync.</p></div>
      <form className="login-form" onSubmit={login}>
        <label>EMAIL<input type="email" name="email" autoComplete="email" required placeholder="you@example.com" /></label>
        <label>PASSWORD<input type="password" name="password" autoComplete="current-password" required placeholder="••••••••" /></label>
        <button type="button" className="forgot-link" onClick={() => setNotice('Password reset is not implemented yet.')}>Forgot password?</button>
        <button type="submit" className="primary-button" disabled={submitting}>{submitting ? 'Logging in…' : 'Log in'}</button>
      </form>
      <div className="divider"><span>or</span></div>
      <button type="button" className="google-button" onClick={googleLogin}><span className="google-badge" aria-hidden="true">G</span>Continue with Google</button>
      <p className="switch-auth">New here? <button type="button" onClick={() => changeView('signup')}>Create an account</button></p>
      <p className="terms">By continuing, you agree to the Terms and Privacy Policy.</p>
      {notice && <p className="form-notice" role="status">{notice}</p>}
    </main> : <main className="signup-screen">
      <header className="signup-intro"><button type="button" className="back-button" aria-label="Back to log in" onClick={() => changeView('login')}>‹</button><h1>Create your account</h1><p>Start budgeting alone or with friends.</p></header>
      <button type="button" className="google-button" onClick={googleLogin}><span className="google-badge" aria-hidden="true">G</span>Sign up with Google</button>
      <p className="manual-divider">or register manually</p>
      <form className="signup-form" onSubmit={register}>
        <label>NAME<input name="name" autoComplete="name" required placeholder="Your name" /></label>
        <label>USERNAME<input name="username" autoComplete="username" required pattern="[A-Za-z0-9_]+" minLength={3} maxLength={30} placeholder="your_username" /></label>
        <label>EMAIL<input type="email" name="email" autoComplete="email" required placeholder="you@example.com" /></label>
        <label>PHONE · OPTIONAL<input type="tel" name="phone" autoComplete="tel" placeholder="+1 555 010 0000" /></label>
        <label>PASSWORD<input type="password" name="password" autoComplete="new-password" minLength={8} pattern="(?=.*[0-9]).{8,}" required title="Use at least 8 characters with a number" placeholder="••••••••" /></label>
        <p className="password-hint">Use at least 8 characters with a number.</p>
        <button type="submit" className="primary-button" disabled={submitting}>{submitting ? 'Creating account…' : 'Create account'}</button>
      </form>
      <p className="switch-auth">Already have an account? <button type="button" onClick={() => changeView('login')}>Log in</button></p>
      {notice && <p className="form-notice" role="status">{notice}</p>}
    </main>}
  </div>;
}
