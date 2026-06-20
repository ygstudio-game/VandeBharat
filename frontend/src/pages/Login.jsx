import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Loader2, AlertTriangle } from 'lucide-react';
import { login, setSession } from '../lib/api';

export const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needs2fa, setNeeds2fa] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(email, password, needs2fa ? totpCode : undefined);
      setSession(data.token, data.user);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('requires_2fa') || msg.toLowerCase().includes('totp code required')) {
        setNeeds2fa(true);
        setError('Enter your 6-digit authenticator code.');
      } else {
        setError('Invalid email or password.');
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <form onSubmit={handleSubmit} className="bg-white border border-border rounded shadow-sm w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <ShieldCheck className="w-5 h-5" />
          <h1 className="text-sm font-black uppercase tracking-wider">VandeInspect AI — Sign In</h1>
        </div>

        {error && (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
          </div>
        )}

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-muted-foreground uppercase">Email</label>
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded text-sm focus:outline-none focus:border-primary"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-muted-foreground uppercase">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded text-sm focus:outline-none focus:border-primary"
          />
        </div>

        {needs2fa && (
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase">Authenticator code</label>
            <input
              maxLength={6}
              autoFocus
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-full px-3 py-2 border border-border rounded text-center font-mono text-lg tracking-widest focus:outline-none focus:border-primary"
            />
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary hover:bg-slate-800 text-white text-xs font-bold uppercase px-3 py-2 rounded shadow transition-all flex items-center justify-center gap-1.5 disabled:opacity-60"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          {needs2fa ? 'Verify & Sign In' : 'Sign In'}
        </button>
      </form>
    </div>
  );
};
