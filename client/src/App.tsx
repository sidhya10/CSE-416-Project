import { useState } from 'react';

type Tab = 'Home' | 'Budget' | 'Groups' | 'Profile';
type AuthView = 'welcome' | 'sign-in' | 'sign-up';
const tabs: Tab[] = ['Home', 'Budget', 'Groups', 'Profile'];

export default function App() {
  const [view, setView] = useState<AuthView>('welcome');
  const [preview, setPreview] = useState(false);
  const [tab, setTab] = useState<Tab>('Home');
  const [notice, setNotice] = useState('');

  if (preview) return (
    <div className="app-frame">
      <header className="page-header"><span className="brand-mark" aria-hidden="true">●</span><span className="brand-name">Together</span><span className="preview-badge">Preview</span></header>
      <main className="empty-page"><h1>{tab}</h1></main>
      <nav className="bottom-nav" aria-label="Main navigation">
        {tabs.map(item => <button key={item} className={tab === item ? 'nav-item active' : 'nav-item'} type="button"
          aria-current={tab === item ? 'page' : undefined} onClick={() => setTab(item)}>{item}</button>)}
      </nav>
    </div>
  );

  return (
    <main className="auth-shell"><div className="auth-card">
      <div className="brand"><span className="brand-mark" aria-hidden="true">●</span><span>Together</span></div>
      {view === 'welcome' ? <>
        <div className="hero-shape" aria-hidden="true"><span>$</span><span>↗</span><span>✓</span></div>
        <p className="eyebrow">Shared expenses, clearer budgets</p>
        <h1>Make room for what matters.</h1>
        <p className="supporting">Split group costs and see your own share in your personal budget.</p>
        <div className="auth-actions">
          <button className="primary-button" onClick={() => { setNotice(''); setView('sign-up'); }}>Create account</button>
          <button className="secondary-button" onClick={() => { setNotice(''); setView('sign-in'); }}>Sign in</button>
        </div>
      </> : <>
        <button className="back-button" type="button" onClick={() => { setNotice(''); setView('welcome'); }}>← Back</button>
        <p className="eyebrow">{view === 'sign-in' ? 'Welcome back' : 'Get started'}</p>
        <h1>{view === 'sign-in' ? 'Sign in to Together' : 'Create your account'}</h1>
        <p className="supporting">{view === 'sign-in' ? 'Your groups and budgets are waiting.' : 'Keep your shared expenses and personal spending in one place.'}</p>
        <form className="auth-form" onSubmit={event => { event.preventDefault(); setNotice('Account authentication is not connected yet. Use the preview below to explore the app.'); }}>
          {view === 'sign-up' && <label>Full name<input name="name" type="text" autoComplete="name" required placeholder="Your name" /></label>}
          <label>Email address<input name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></label>
          <label>Password<input name="password" type="password" autoComplete={view === 'sign-in' ? 'current-password' : 'new-password'} minLength={8} required placeholder="At least 8 characters" /></label>
          <button className="primary-button" type="submit">{view === 'sign-in' ? 'Sign in' : 'Create account'}</button>
          {notice && <p className="form-notice" role="status">{notice}</p>}
        </form>
        <p className="switch-auth">{view === 'sign-in' ? 'New to Together?' : 'Already have an account?'}{' '}
          <button type="button" onClick={() => { setNotice(''); setView(view === 'sign-in' ? 'sign-up' : 'sign-in'); }}>{view === 'sign-in' ? 'Create account' : 'Sign in'}</button>
        </p>
      </>}
      <button className="preview-link" type="button" onClick={() => { setTab('Home'); setPreview(true); }}>Explore app preview →</button>
    </div></main>
  );
}
