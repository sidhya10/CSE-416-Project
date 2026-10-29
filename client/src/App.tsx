import GuestSplit from './pages/expenses/GuestSplit';
import NotificationsPage from './pages/notifications/NotificationsPage';
import NotificationsNavButton from './pages/notifications/NotificationsNavButton';
import { useEffect, useState, type FormEvent } from 'react';
import GoogleSignInButton from './components/auth/GoogleSignInButton';
import { disableGoogleAutoSelect } from './components/auth/googleIdentity';
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

type Tab = 'Home' | 'Budget' | 'Groups' | 'Notifications' | 'Profile';
type AuthView = 'login' | 'signup' | 'forgot' | 'reset';
const tabs: { label: Tab; glyph: string }[] = [
  { label: 'Home', glyph: '⌂' }, { label: 'Budget', glyph: '▥' },
  { label: 'Groups', glyph: '◎' }, { label: 'Notifications', glyph: '' }, { label: 'Profile', glyph: '●' },
];

export default function App({ initialUser, groupFixtures, friendFixtures }: {
  initialUser?: AppUser;
  groupFixtures?: GroupFixture[];
  friendFixtures?: FriendFixture[];
} = {}) {
  const initialResetToken = new URLSearchParams(window.location.search).get('reset') ?? '';
  const [resetToken, setResetToken] = useState(initialResetToken);
  const [guest, setGuest] = useState(false);
  const [view, setView] = useState<AuthView>(initialResetToken ? 'reset' : 'login');
  const [user, setUser] = useState<AppUser | null>(initialUser ?? null);
  const [loading, setLoading] = useState(!initialUser);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [tab, setTab] = useState<Tab>('Home');
  const [budgetTarget, setBudgetTarget] = useState<{ category: string; expenseId: string } | null>(null);
  useEffect(() => {
    if (tab !== 'Budget') setBudgetTarget(null);
  }, [tab]);
  useEffect(() => {
    const open = (event: Event) => { setBudgetTarget((event as CustomEvent<{ category: string; expenseId: string }>).detail); setSimulatorOpen(false); setTab('Budget'); };
    window.addEventListener('cse416:open-budget-expense', open);
    return () => window.removeEventListener('cse416:open-budget-expense', open);
  }, []);
  const [notificationTarget, setNotificationTarget] = useState<{ groupId: string; expenseId?: string; request: number } | null>(null);
  const [notice, setNotice] = useState('');
  const [profileAtRoot, setProfileAtRoot] = useState(true);
  const [groupsAtRoot, setGroupsAtRoot] = useState(true);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [simulatorVisited, setSimulatorVisited] = useState(false);
  const [googlePhone, setGooglePhone] = useState('');
  const [resetPasswords, setResetPasswords] = useState({ next: '', confirm: '' });
  const [recovery, setRecovery] = useState({ identifier: '', code: '', next: '', confirm: '' });

  useEffect(() => {
    if (initialUser) return;
    authApi.me().then(result => setUser(result.user)).catch(() => undefined).finally(() => setLoading(false));
  }, [initialUser]);
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
    if (googleSubmitting) return;
    const values = new FormData(event.currentTarget);
    void authenticate(() => authApi.login(String(values.get('identifier')), String(values.get('password'))));
  };
  const register = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (googleSubmitting) return;
    const values = new FormData(event.currentTarget);
    void authenticate(() => authApi.register({
      name: String(values.get('name')), username: String(values.get('username')), email: String(values.get('email')),
      phone: String(values.get('phone')), password: String(values.get('password')),
    }));
  };
  const recoverWithCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (recovery.next !== recovery.confirm) { setNotice('New passwords do not match.'); return; }
    setSubmitting(true); setNotice('');
    try {
      const result = await authApi.resetWithRecoveryCode(recovery.identifier, recovery.code, recovery.next, recovery.confirm);
      setRecovery({ identifier: '', code: '', next: '', confirm: '' });
      setView('login');
      setNotice(result.message);
    }
    catch (error) { handleError(error); }
    finally { setSubmitting(false); }
  };
  const resetPassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (resetPasswords.next !== resetPasswords.confirm) { setNotice('New passwords do not match.'); return; }
    void authenticate(() => authApi.resetPassword(resetToken, resetPasswords.next, resetPasswords.confirm).then(result => {
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
      setResetToken('');
      return result;
    }));
  };
  const logout = async () => {
    try { disableGoogleAutoSelect(); await authApi.logout(); }
    finally { setUser(null); setTab('Home'); setProfileAtRoot(true); setNotice(''); }
  };

  if (loading) return <div className="device"><main className="login-screen"><p className="form-notice" role="status">Loading your account…</p></main></div>;

  if (guest && !user) return <div className="device"><GuestSplit onClose={() => setGuest(false)} /></div>;

  return <div className="device">
    {user ? <>
      <div hidden={tab !== 'Home'} className="profile-content"><HomeDashboard userName={user.name} active={tab === 'Home'} onNavigate={setTab} /></div>
      <div hidden={tab !== 'Notifications'} className="profile-content"><NotificationsPage key={user.id} active={tab === 'Notifications'} onBack={() => setTab('Home')} onOpenGroup={(groupId, expenseId) => { setNotificationTarget({ groupId, expenseId, request: Date.now() }); setTab('Groups'); }} /></div>
      <div hidden={tab !== 'Budget' || simulatorOpen} className="profile-content"><CategoryBudgets onClearExpenseTarget={() => setBudgetTarget(null)} expenseTarget={budgetTarget} active={tab === 'Budget'} onOpenSimulator={() => { setSimulatorVisited(true); setSimulatorOpen(true); }} /></div>
      <div hidden={tab !== 'Budget' || !simulatorOpen} className="profile-content">{simulatorVisited && <WhatIfSimulator active={tab === 'Budget' && simulatorOpen} onBack={() => setSimulatorOpen(false)} />}</div>
      <div hidden={tab !== 'Profile'} className="profile-content"><ProfileSettings user={user} onUserChange={setUser} onRootChange={setProfileAtRoot} onLogout={() => void logout()} /></div>
      <div hidden={tab !== 'Groups'} className="profile-content"><GroupsWorkspace notificationTarget={notificationTarget} visible={tab === 'Groups'} currentUser={user} onRootChange={setGroupsAtRoot} initialGroupsData={groupFixtures} initialFriendsData={friendFixtures} /></div>
      {(tab === 'Home' || tab === 'Notifications' || (tab === 'Budget' && !simulatorOpen) || (tab === 'Profile' && profileAtRoot) || (tab === 'Groups' && groupsAtRoot)) && <nav className="bottom-nav" aria-label="Main navigation">
        {tabs.map(({ label, glyph }) => label === 'Notifications' ? <NotificationsNavButton key={`${user.id}-notifications`} selected={tab === label} onClick={() => setTab(label)} /> : <button key={label} type="button" className={tab === label ? 'tab active' : 'tab'} aria-current={tab === label ? 'page' : undefined} onClick={() => setTab(label)}><span className="tab-glyph" aria-hidden="true">{glyph}</span><span>{label}</span></button>)}
      </nav>}
    </> : view === 'login' ? <main key="login" className="login-screen">
      <div className="login-intro"><div className="logo-tile"><img src={receiptLogo} width="52" height="52" alt="" /></div><h1>Welcome back</h1><p>Keep personal and shared spending in sync.</p></div>
      <form className="login-form" onSubmit={login}>
        <label>USERNAME, EMAIL, OR PHONE<input name="identifier" autoComplete="username" required placeholder="@username, email, or phone" /></label>
        <label>PASSWORD<input type="password" name="password" autoComplete="current-password" required placeholder="••••••••" /></label>
        <button type="button" className="forgot-link" onClick={() => changeView('forgot')}>Forgot password?</button>
        <button type="submit" className="primary-button" disabled={submitting || googleSubmitting}>{submitting ? 'Logging in…' : 'Log in'}</button>
      </form>
      <div className="divider"><span>or</span></div>
      <GoogleSignInButton onBusyChange={setGoogleSubmitting} disabled={submitting} onSuccess={account => { setUser(account); setTab('Home'); setNotice(''); }} />
      <p className="switch-auth">New here? <button type="button" onClick={() => changeView('signup')}>Create an account</button></p>
      <button className="guest-login-link" type="button" disabled={submitting || googleSubmitting} onClick={() => setGuest(true)}>Continue as guest · Quick split</button>
      <p className="terms">By continuing, you agree to the Terms and Privacy Policy.</p>
      {notice && <p className="form-notice" role="status">{notice}</p>}
    </main> : view === 'forgot' ? <main key="forgot" className="signup-screen">
      <header className="signup-intro"><button type="button" className="back-button" aria-label="Back to log in" onClick={() => changeView('login')}>‹</button><h1>Reset your password</h1><p>Use one of the recovery codes you saved from Account settings.</p></header>
      <form className="signup-form" onSubmit={recoverWithCode}>
        <label>USERNAME, EMAIL, OR PHONE<input autoComplete="username" required placeholder="@username, email, or phone" value={recovery.identifier} onChange={event => setRecovery(previous => ({ ...previous, identifier: event.target.value }))} /></label>
        <label>RECOVERY CODE<input autoComplete="one-time-code" required placeholder="XXXX-XXXX-XXXX-XXXX" value={recovery.code} onChange={event => setRecovery(previous => ({ ...previous, code: event.target.value.toUpperCase() }))} /></label>
        <label>NEW PASSWORD<input type="password" autoComplete="new-password" required minLength={8} maxLength={72} pattern="(?=.*[0-9]).{8,}" value={recovery.next} onChange={event => setRecovery(previous => ({ ...previous, next: event.target.value }))} /></label>
        <label>CONFIRM PASSWORD<input type="password" autoComplete="new-password" required value={recovery.confirm} onChange={event => setRecovery(previous => ({ ...previous, confirm: event.target.value }))} /></label>
        <button type="submit" className="primary-button" disabled={submitting}>{submitting ? 'Resetting…' : 'Reset with recovery code'}</button>
      </form>
      <div className="divider"><span>or</span></div>
      <GoogleSignInButton intent="recover" disabled={submitting} onBusyChange={setGoogleSubmitting} onRecovery={token => { setResetToken(token); setResetPasswords({ next: '', confirm: '' }); changeView('reset'); }} />
      {notice && <p className="form-notice" role="status">{notice}</p>}
    </main> : view === 'reset' ? <main key="reset" className="signup-screen">
      <header className="signup-intro"><button type="button" className="back-button" aria-label="Back to log in" onClick={() => changeView('login')}>‹</button><h1>Choose a new password</h1><p>Use at least 8 characters, including a number.</p></header>
      <form className="signup-form" onSubmit={resetPassword}>
        <label>NEW PASSWORD<input type="password" autoComplete="new-password" required minLength={8} maxLength={72} pattern="(?=.*[0-9]).{8,}" value={resetPasswords.next} onChange={event => setResetPasswords({ ...resetPasswords, next: event.target.value })} /></label>
        <label>CONFIRM PASSWORD<input type="password" autoComplete="new-password" required value={resetPasswords.confirm} onChange={event => setResetPasswords({ ...resetPasswords, confirm: event.target.value })} /></label>
        <button type="submit" className="primary-button" disabled={submitting || !resetToken}>{submitting ? 'Updating…' : 'Reset password'}</button>
      </form>
      {notice && <p className="form-notice" role="status">{notice}</p>}
    </main> : <main key="signup" className="signup-screen">
      <header className="signup-intro"><button type="button" className="back-button" aria-label="Back to log in" onClick={() => changeView('login')}>‹</button><h1>Create your account</h1><p>Start budgeting alone or with friends.</p></header>
      <label className="google-phone-field">PHONE NUMBER · REQUIRED<input type="tel" value={googlePhone} onChange={event => setGooglePhone(event.target.value)} autoComplete="tel" required placeholder="+1 555 010 0000" /></label>
      <GoogleSignInButton signup phone={googlePhone} onBusyChange={setGoogleSubmitting} disabled={submitting || googlePhone.replace(/\D/g, '').length < 7} onSuccess={account => { setUser(account); setTab('Home'); setNotice(''); }} />
      <p className="manual-divider">or register manually</p>
      <form className="signup-form" onSubmit={register}>
        <label>NAME<input name="name" autoComplete="name" required placeholder="Your name" /></label>
        <label>USERNAME<input name="username" autoComplete="username" required pattern="[A-Za-z0-9_]+" minLength={3} maxLength={30} placeholder="your_username" /></label>
        <label>EMAIL<input type="email" name="email" autoComplete="email" required placeholder="you@example.com" /></label>
        <label>PHONE NUMBER<input type="tel" name="phone" autoComplete="tel" required placeholder="+1 555 010 0000" /></label>
        <label>PASSWORD<input type="password" name="password" autoComplete="new-password" minLength={8} pattern="(?=.*[0-9]).{8,}" required title="Use at least 8 characters with a number" placeholder="••••••••" /></label>
        <p className="password-hint">Use at least 8 characters with a number.</p>
        <button type="submit" className="primary-button" disabled={submitting || googleSubmitting}>{submitting ? 'Creating account…' : 'Create account'}</button>
      </form>
      <p className="switch-auth">Already have an account? <button type="button" onClick={() => changeView('login')}>Log in</button></p>
      {notice && <p className="form-notice" role="status">{notice}</p>}
    </main>}
  </div>;
}
