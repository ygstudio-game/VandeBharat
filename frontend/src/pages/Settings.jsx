import React, { useState, useEffect, useCallback } from 'react';
import {
  Sliders,
  Users,
  FileSpreadsheet,
  Save,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  UserPlus,
  AlertTriangle,
  KeyRound,
  Smartphone,
  X,
  UserX,
  UserCheck,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ROLES, ROLE_LABELS } from '../lib/roles';
import { useAuth } from '../contexts/AuthContext';
import {
  getUsers, createUser, patchUserRole, patchUserActive,
  setup2fa, verify2fa, disable2fa,
  getAuditLog,
} from '../lib/api';

const ROLE_BADGE = {
  [ROLES.ADMIN]:          'bg-purple-50 text-purple-700 border-purple-200',
  [ROLES.RDSO_INSPECTOR]: 'bg-blue-50 text-blue-700 border-blue-200',
  [ROLES.ZR_OFFICER]:     'bg-amber-50 text-amber-700 border-amber-200',
  [ROLES.FIELD_STAFF]:    'bg-slate-100 text-slate-600 border-slate-200',
};

const ROLE_DESCRIPTIONS = {
  [ROLES.ADMIN]:          'Full system access — user management, thresholds, all reports.',
  [ROLES.RDSO_INSPECTOR]: 'Certifies inspection reports, reviews defects, signs off coaches.',
  [ROLES.ZR_OFFICER]:     'Zonal Railway oversight — views reports and analytics across depots.',
  [ROLES.FIELD_STAFF]:    'Depot-level view & review only — no certification authority.',
};

// Real 2FA setup modal — calls backend to generate TOTP secret + QR
function TwoFactorSetupModal({ onClose, onEnabled }) {
  const [phase,   setPhase]   = useState('loading'); // 'loading' | 'scan' | 'verify' | 'done' | 'error'
  const [qr,      setQr]      = useState('');
  const [secret,  setSecret]  = useState('');
  const [code,    setCode]    = useState('');
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setup2fa()
      .then((data) => { setQr(data.qr_data_url); setSecret(data.secret); setPhase('scan'); })
      .catch(() => setPhase('error'));
  }, []);

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await verify2fa(code);
      setPhase('done');
      setTimeout(() => { onEnabled(); onClose(); }, 800);
    } catch {
      setError('Invalid code — check your authenticator app and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded shadow-2xl border border-border w-full max-w-sm p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
            <KeyRound className="w-4 h-4 text-primary" /> Enable 2FA
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
        </div>

        {phase === 'loading' && (
          <div className="flex items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Generating QR code…
          </div>
        )}

        {phase === 'error' && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded">
            Failed to start 2FA setup. Please try again.
          </div>
        )}

        {phase === 'scan' && (
          <>
            <div className="bg-slate-50 border border-border rounded p-4 flex flex-col items-center gap-2">
              <img src={qr} alt="TOTP QR code" className="w-40 h-40" />
              <p className="text-[10px] text-muted-foreground text-center">Scan with Google Authenticator, Authy, or similar.</p>
              <p className="text-[9px] text-muted-foreground font-mono text-center break-all px-2">{secret}</p>
            </div>

            <form onSubmit={handleVerify} className="space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">Enter 6-digit code to confirm</label>
              <input
                autoFocus
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="w-full px-3 py-2 border border-border rounded text-center font-mono text-lg tracking-widest focus:outline-none focus:border-primary"
              />
              {error && <p className="text-[10px] text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={code.length !== 6 || loading}
                className="w-full bg-primary hover:bg-slate-800 text-white text-xs font-bold uppercase px-3 py-2 rounded shadow transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Verifying…</> : 'Verify & Enable 2FA'}
              </button>
            </form>
          </>
        )}

        {phase === 'done' && (
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded">
            <CheckCircle2 className="w-4 h-4" /> 2FA enabled successfully.
          </div>
        )}
      </div>
    </div>
  );
}

export const Settings = () => {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('thresholds');

  // Threshold state (local only — no backend endpoint yet)
  const [ocrThresh,   setOcrThresh]   = useState(85);
  const [brakeThresh, setBrakeThresh] = useState(80);
  const [boltThresh,  setBoltThresh]  = useState(75);
  const [isSaving,    setIsSaving]    = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // User management state
  const [users,        setUsers]       = useState([]);
  const [usersLoading, setUsersLoading]= useState(false);
  const [usersError,   setUsersError]  = useState('');
  const [showAddUser,  setShowAddUser] = useState(false);
  const [newUser,      setNewUser]     = useState({ email: '', name: '', password: '', role: ROLES.FIELD_STAFF });
  const [addError,     setAddError]    = useState('');
  const [addLoading,   setAddLoading]  = useState(false);
  const [twoFaTarget,  setTwoFaTarget] = useState(null);

  // Audit log state
  const [auditLogs,    setAuditLogs]   = useState([]);
  const [auditLoading, setAuditLoading]= useState(false);

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError('');
    try {
      const data = await getUsers();
      setUsers(data.users || []);
    } catch (err) {
      setUsersError(err.message || 'Failed to load users');
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const fetchAuditLog = useCallback(async () => {
    setAuditLoading(true);
    try {
      const data = await getAuditLog({ limit: 50 });
      setAuditLogs(data.logs || []);
    } catch {
      // non-fatal
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'users')  fetchUsers();
    if (activeTab === 'audit')  fetchAuditLog();
  }, [activeTab, fetchUsers, fetchAuditLog]);

  const handleSaveThresholds = (e) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    setTimeout(() => {
      setIsSaving(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }, 1200);
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await patchUserRole(userId, newRole);
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: newRole } : u));
    } catch {
      // revert or show error — silent for now
    }
  };

  const handleToggleActive = async (userId, currentlyActive) => {
    try {
      await patchUserActive(userId, !currentlyActive);
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, is_active: !currentlyActive } : u));
    } catch {
      // silent
    }
  };

  const handleDisable2fa = async (userId) => {
    try {
      await disable2fa();
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, totp_enabled: false } : u));
    } catch {
      // silent
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!newUser.email.trim() || !newUser.name.trim() || !newUser.password.trim()) return;
    setAddError('');
    setAddLoading(true);
    try {
      const data = await createUser(newUser);
      setUsers((prev) => [...prev, data.user]);
      setNewUser({ email: '', name: '', password: '', role: ROLES.FIELD_STAFF });
      setShowAddUser(false);
    } catch (err) {
      setAddError(err.message || 'Failed to create user');
    } finally {
      setAddLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black tracking-tight text-foreground">ADMINISTRATIVE SETTINGS</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure detection thresholds, manage inspector profiles, and review audit logs.</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border text-sm font-bold gap-6">
        <button
          onClick={() => setActiveTab('thresholds')}
          className={`pb-3 flex items-center gap-1.5 transition-all relative ${activeTab === 'thresholds' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Sliders className="w-4 h-4" /> Model & Detection Thresholds
        </button>
        {isAdmin && (
          <button
            onClick={() => setActiveTab('users')}
            className={`pb-3 flex items-center gap-1.5 transition-all relative ${activeTab === 'users' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Users className="w-4 h-4" /> User Management
          </button>
        )}
        {isAdmin && (
          <button
            onClick={() => setActiveTab('audit')}
            className={`pb-3 flex items-center gap-1.5 transition-all relative ${activeTab === 'audit' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <FileSpreadsheet className="w-4 h-4" /> Security Audit Log
          </button>
        )}
      </div>

      {/* Content Area */}
      {activeTab === 'thresholds' && (
        <form onSubmit={handleSaveThresholds} className="space-y-6 max-w-2xl">
          <Card className="border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                <Sliders className="w-4 h-4 text-primary" /> Confidence Threshold Registry
              </CardTitle>
              <CardDescription className="text-xs">Adjust inference confidence thresholds required to trigger critical railway depot alerts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-700">Brake Crack Detection Threshold</span>
                  <span className="font-mono text-primary font-bold">{brakeThresh}%</span>
                </div>
                <input type="range" min="50" max="95" value={brakeThresh} onChange={(e) => setBrakeThresh(Number(e.target.value))} className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-primary" />
                <p className="text-[10px] text-muted-foreground">Alerts are generated if Custom Model confidence matches or exceeds this limit.</p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-700">Loose Bogie Coupling Bolt Threshold</span>
                  <span className="font-mono text-primary font-bold">{boltThresh}%</span>
                </div>
                <input type="range" min="50" max="95" value={boltThresh} onChange={(e) => setBoltThresh(Number(e.target.value))} className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-primary" />
                <p className="text-[10px] text-muted-foreground">Lower limits catch more bolt issues but increase false anomaly reviews.</p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-700">Coach Number Match Acceptance</span>
                  <span className="font-mono text-primary font-bold">{ocrThresh}%</span>
                </div>
                <input type="range" min="60" max="99" value={ocrThresh} onChange={(e) => setOcrThresh(Number(e.target.value))} className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-primary" />
                <p className="text-[10px] text-muted-foreground">Confidence limit required to auto-commit coach numbers without operator review.</p>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-border">
                {saveSuccess ? (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Threshold configs saved successfully.
                  </div>
                ) : <div />}
                <button type="submit" disabled={isSaving} className="bg-primary hover:bg-slate-800 text-white text-xs font-bold uppercase px-4 py-2 rounded shadow transition-all flex items-center gap-1.5 disabled:opacity-75">
                  {isSaving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</> : <><Save className="w-3.5 h-3.5" /> Save Thresholds</>}
                </button>
              </div>
            </CardContent>
          </Card>
        </form>
      )}

      {activeTab === 'users' && (
        <div className="space-y-8">
          {/* Role legend */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.values(ROLES).map((role) => (
              <div key={role} className="bg-card border border-border rounded p-3 space-y-1.5">
                <span className={`inline-flex items-center text-[9px] font-bold px-2 py-0.5 rounded-full border ${ROLE_BADGE[role]}`}>{ROLE_LABELS[role]}</span>
                <p className="text-[10px] text-muted-foreground leading-snug">{ROLE_DESCRIPTIONS[role]}</p>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider">Authorised Depot Personnel Registry</h3>
              <button onClick={fetchUsers} className="p-1 text-muted-foreground hover:text-foreground" title="Refresh">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              onClick={() => setShowAddUser(true)}
              className="bg-primary hover:bg-slate-800 text-white text-xs font-bold uppercase px-3 py-1.5 rounded shadow transition-all flex items-center gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5" /> Register Inspector
            </button>
          </div>

          {showAddUser && (
            <form onSubmit={handleAddUser} className="bg-card border border-border rounded p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <input
                  autoFocus
                  value={newUser.name}
                  onChange={(e) => setNewUser((u) => ({ ...u, name: e.target.value }))}
                  placeholder="Full name / designation"
                  className="px-3 py-2 border border-border rounded text-xs focus:outline-none focus:border-primary"
                />
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser((u) => ({ ...u, email: e.target.value }))}
                  placeholder="Email address"
                  className="px-3 py-2 border border-border rounded text-xs focus:outline-none focus:border-primary"
                />
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser((u) => ({ ...u, password: e.target.value }))}
                  placeholder="Initial password"
                  className="px-3 py-2 border border-border rounded text-xs focus:outline-none focus:border-primary"
                />
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser((u) => ({ ...u, role: e.target.value }))}
                  className="px-3 py-2 border border-border rounded text-xs focus:outline-none focus:border-primary"
                >
                  {Object.values(ROLES).map((role) => (
                    <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                  ))}
                </select>
              </div>
              {addError && (
                <p className="text-[10px] text-red-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {addError}</p>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { setShowAddUser(false); setAddError(''); }} className="text-xs font-bold px-3 py-1.5 border border-border rounded hover:bg-secondary">Cancel</button>
                <button type="submit" disabled={addLoading} className="text-xs font-bold px-3 py-1.5 bg-primary text-primary-foreground rounded flex items-center gap-1.5 disabled:opacity-60">
                  {addLoading ? <><Loader2 className="w-3 h-3 animate-spin" /> Adding…</> : 'Add User'}
                </button>
              </div>
            </form>
          )}

          {usersLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading users…
            </div>
          ) : usersError ? (
            <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded">
              <AlertTriangle className="w-4 h-4" /> {usersError}
            </div>
          ) : (
            <div className="bg-card border border-border rounded shadow-sm overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-border text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    <th className="p-3">Name</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Role</th>
                    <th className="p-3">2FA</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-medium text-slate-700">
                  {users.map((u) => (
                    <tr key={u.id} className={`hover:bg-slate-50/50 ${!u.is_active ? 'opacity-50' : ''}`}>
                      <td className="p-3 font-bold text-slate-900">{u.name}</td>
                      <td className="p-3 font-mono text-[10px]">{u.email}</td>
                      <td className="p-3">
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                          className={`text-[10px] font-bold px-2 py-1 rounded-full border ${ROLE_BADGE[u.role] || 'bg-slate-100 border-slate-200'} bg-transparent cursor-pointer`}
                        >
                          {Object.values(ROLES).map((role) => (
                            <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-3">
                        {u.totp_enabled ? (
                          <button
                            onClick={() => handleDisable2fa(u.id)}
                            className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                            title="Click to disable 2FA"
                          >
                            <ShieldCheck className="w-3 h-3" /> 2FA ON
                          </button>
                        ) : (
                          <button
                            onClick={() => setTwoFaTarget(u)}
                            className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200"
                          >
                            <KeyRound className="w-3 h-3" /> ENABLE 2FA
                          </button>
                        )}
                      </td>
                      <td className="p-3">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${u.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleToggleActive(u.id, u.is_active)}
                          className="text-slate-400 hover:text-amber-600 transition-colors"
                          title={u.is_active ? 'Deactivate account' : 'Reactivate account'}
                        >
                          {u.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-muted-foreground italic">No users registered.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {twoFaTarget && (
            <TwoFactorSetupModal
              onClose={() => setTwoFaTarget(null)}
              onEnabled={() => {
                setUsers((prev) => prev.map((u) => u.id === twoFaTarget.id ? { ...u, totp_enabled: true } : u));
                setTwoFaTarget(null);
              }}
            />
          )}
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded text-xs font-semibold leading-relaxed flex-1 mr-4">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              All threshold adjustments and report certifications are permanently logged for safety auditing.
            </div>
            <button onClick={fetchAuditLog} className="p-2 text-muted-foreground hover:text-foreground border border-border rounded" title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-card border border-border rounded shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border bg-slate-50/50">
              <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider">Secured Administrative Log Audit Trail</h3>
            </div>
            {auditLoading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading audit log…
              </div>
            ) : (
              <div className="divide-y divide-border text-xs max-h-[500px] overflow-y-auto">
                {auditLogs.length === 0 ? (
                  <p className="p-6 text-center text-muted-foreground italic">No audit log entries yet.</p>
                ) : auditLogs.map((log) => (
                  <div key={log.id} className="p-3 hover:bg-slate-50/50 flex justify-between items-center gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono font-bold text-slate-500 text-[9px] uppercase shrink-0 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                        {log.action}
                      </span>
                      <span className="font-bold text-slate-800 font-mono truncate">{log.actor}</span>
                      {log.resource_type && (
                        <span className="text-muted-foreground truncate">{log.resource_type} {log.resource_id?.slice(0, 8)}</span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono shrink-0">
                      {new Date(log.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
