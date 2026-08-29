import { useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { BrandMark } from '../components/BrandMark';
import { useAuth } from '../components/Auth';
import { ApiError } from '../lib/api';
import { LanguageSelector } from '../components/PreferenceControls';

export function LoginPage() {
  const { session, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  if (session) return <Navigate replace to="/overview" />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await signIn(username.trim(), password);
      const from = (location.state as { from?: string } | null)?.from;
      void navigate(from?.startsWith('/') && !from.startsWith('//') ? from : '/overview', { replace: true });
    } catch (reason) {
      setError(reason instanceof ApiError && reason.status === 401 ? 'Username or password is incorrect.' : 'Sign in is temporarily unavailable. Please try again.');
    } finally { setIsSubmitting(false); }
  }

  return <main className="login-page">
    <section className="login-story" aria-label="EDY HelpDesk product introduction">
      <div className="login-brand"><BrandMark /><span><strong>EDY HELPDESK</strong><small>IT OPERATIONS / SERVICE DESK</small></span></div>
      <div className="login-story__content"><span className="eyebrow eyebrow--accent">Operational clarity</span><h1>Every request.<br />One accountable path.</h1><p>A focused workspace for support teams to triage, resolve, and learn from every service interaction.</p><div className="trust-row"><span><ShieldCheck size={16} aria-hidden="true" />Local-first</span><span><LockKeyhole size={16} aria-hidden="true" />Session protected</span></div></div>
      <p className="login-story__foot">Portfolio Demo · Synthetic data only</p>
    </section>
    <section className="login-panel" aria-labelledby="login-title">
      <div className="login-language"><LanguageSelector compact /></div>
      <form className="login-card" onSubmit={(event) => void submit(event)} noValidate>
        <header><span className="eyebrow">Secure workspace</span><h2 id="login-title">Welcome back</h2><p>Sign in with your EDY HelpDesk account.</p></header>
        {error ? <div className="inline-alert" role="alert"><span>{error}</span></div> : null}
        <label className="field"><span>Username</span><input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required minLength={3} autoFocus /></label>
        <label className="field"><span>Password</span><span className="input-with-action"><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
        <button className="button button--primary button--wide" type="submit" disabled={isSubmitting || username.trim().length < 3 || password.length < 8}>{isSubmitting ? <><span className="spinner" />Signing in…</> : <>Enter workspace<ArrowRight size={16} aria-hidden="true" /></>}</button>
        <p className="login-privacy"><LockKeyhole size={13} aria-hidden="true" />Your session is stored in a secure HttpOnly cookie.</p>
      </form>
    </section>
  </main>;
}
