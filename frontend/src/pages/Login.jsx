import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Train, KeyRound, Loader2, ShieldAlert, Eye, EyeOff } from 'lucide-react';

export function Login() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { login } = useAuth();

  const from = location.state?.from?.pathname || '/dashboard';

  const [step,     setStep]     = useState('credentials'); // 'credentials' | '2fa'
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [totp,     setTotp]     = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const handleCredentials = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);

    if (result.ok) {
      navigate(from, { replace: true });
    } else if (result.requires_2fa) {
      setStep('2fa');
    } else {
      setError(result.error || 'Login failed');
    }
  };

  const handle2fa = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email, password, totp);
    setLoading(false);

    if (result.ok) {
      navigate(from, { replace: true });
    } else {
      setError(result.error || 'Invalid 2FA code');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        {/* Branding */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-primary/10 border border-primary/20 mb-2">
            <Train className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-xl font-black tracking-tight text-foreground">VANDE INSPECT AI</h1>
          <p className="text-xs text-muted-foreground font-semibold">Secure depot inspector portal — authorised personnel only</p>
        </div>

        {/* Card */}
        <div className="bg-white border border-border rounded-xl shadow-sm p-6 space-y-5">
          {step === 'credentials' ? (
            <>
              <div>
                <h2 className="text-sm font-black text-foreground">Sign in to your account</h2>
                <p className="text-[10px] text-muted-foreground font-semibold mt-0.5">Enter your depot credentials below</p>
              </div>

              <form onSubmit={handleCredentials} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Email</label>
                  <input
                    type="email"
                    autoFocus
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@railway.gov.in"
                    className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Password</label>
                  <div className="relative">
                    <input
                      type={showPwd ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2.5 pr-10 border border-border rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
                    <ShieldAlert className="w-4 h-4 shrink-0 text-red-500" />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary hover:bg-slate-800 text-white text-sm font-bold py-2.5 rounded-lg shadow transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</> : 'Sign In'}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-primary" />
                <div>
                  <h2 className="text-sm font-black text-foreground">Two-Factor Authentication</h2>
                  <p className="text-[10px] text-muted-foreground font-semibold">Enter the 6-digit code from your authenticator app</p>
                </div>
              </div>

              <form onSubmit={handle2fa} className="space-y-4">
                <input
                  type="text"
                  autoFocus
                  inputMode="numeric"
                  maxLength={6}
                  value={totp}
                  onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full px-3 py-3 border border-border rounded-lg text-center font-mono text-2xl tracking-[0.5em] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                />

                {error && (
                  <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
                    <ShieldAlert className="w-4 h-4 shrink-0 text-red-500" />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || totp.length !== 6}
                  className="w-full bg-primary hover:bg-slate-800 text-white text-sm font-bold py-2.5 rounded-lg shadow transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</> : 'Verify Code'}
                </button>

                <button
                  type="button"
                  onClick={() => { setStep('credentials'); setError(''); setTotp(''); }}
                  className="w-full text-xs font-bold text-muted-foreground hover:text-foreground py-1"
                >
                  ← Back to sign in
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-[10px] text-muted-foreground font-semibold">
          Indian Railways · VandeInspect AI v1.0 · Authorised Access Only
        </p>
      </div>
    </div>
  );
}
