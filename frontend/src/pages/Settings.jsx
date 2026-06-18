import React, { useState } from 'react';
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
  Trash2,
  ShieldOff,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ROLES, ROLE_LABELS } from '../lib/roles';

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

const INITIAL_USERS = [
  { id: 'OPERATOR_319', name: 'Senior Section Engineer', zone: 'Western Railway (Mumbai Central CDO)', role: ROLES.ADMIN, twoFactorEnabled: true },
  { id: 'OPERATOR_320', name: 'Junior Depot Officer', zone: 'Northern Railway (New Delhi CDO)', role: ROLES.FIELD_STAFF, twoFactorEnabled: false },
];

// Mock 2FA setup dialog — visual only, does not call any backend or generate a real TOTP secret.
function TwoFactorSetupModal({ user, onClose, onEnabled }) {
  const [code, setCode] = useState('');
  const [verified, setVerified] = useState(false);

  const handleVerify = (e) => {
    e.preventDefault();
    if (code.trim().length === 6) {
      setVerified(true);
      setTimeout(() => {
        onEnabled(user.id);
        onClose();
      }, 900);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded shadow-2xl border border-border w-full max-w-sm p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
            <KeyRound className="w-4 h-4 text-primary" /> Enable 2FA — {user.id}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
        </div>

        <div className="bg-slate-50 border border-border rounded p-4 flex flex-col items-center gap-2">
          <div className="w-32 h-32 bg-white border border-slate-300 rounded flex items-center justify-center">
            <Smartphone className="w-10 h-10 text-slate-300" />
          </div>
          <p className="text-[10px] text-muted-foreground text-center">
            Mock QR code — scan with an authenticator app. (Preview only, no real TOTP secret is generated.)
          </p>
        </div>

        {verified ? (
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded">
            <CheckCircle2 className="w-4 h-4" /> 2FA enabled for this account.
          </div>
        ) : (
          <form onSubmit={handleVerify} className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase">6-digit verification code</label>
            <input
              autoFocus
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-full px-3 py-2 border border-border rounded text-center font-mono text-lg tracking-widest focus:outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={code.length !== 6}
              className="w-full bg-primary hover:bg-slate-800 text-white text-xs font-bold uppercase px-3 py-2 rounded shadow transition-all disabled:opacity-40"
            >
              Verify & Enable
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export const Settings = () => {
  const [activeTab, setActiveTab] = useState('thresholds');

  // State for thresholds
  const [ocrThresh, setOcrThresh] = useState(85);
  const [brakeThresh, setBrakeThresh] = useState(80);
  const [boltThresh, setBoltThresh] = useState(75);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // User Management state — frontend-only mock, no backend persistence
  const [users, setUsers] = useState(INITIAL_USERS);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', zone: '', role: ROLES.FIELD_STAFF });
  const [twoFaTarget, setTwoFaTarget] = useState(null);

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

  const handleRoleChange = (userId, newRole) => {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
  };

  const handleDisable2fa = (userId) => {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, twoFactorEnabled: false } : u)));
  };

  const handleEnable2fa = (userId) => {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, twoFactorEnabled: true } : u)));
  };

  const handleRemoveUser = (userId) => {
    setUsers((prev) => prev.filter((u) => u.id !== userId));
  };

  const handleAddUser = (e) => {
    e.preventDefault();
    if (!newUser.name.trim()) return;
    const id = `OPERATOR_${Math.floor(300 + Math.random() * 700)}`;
    setUsers((prev) => [...prev, { id, name: newUser.name, zone: newUser.zone || '—', role: newUser.role, twoFactorEnabled: false }]);
    setNewUser({ name: '', zone: '', role: ROLES.FIELD_STAFF });
    setShowAddUser(false);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black tracking-tight text-foreground">ADMINISTRATIVE SETTINGS</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure computer vision model thresholds, manage inspector profiles, and review audit logs.</p>
      </div>

      {/* Dev note: auth/RBAC enforcement is not wired up yet — this is a frontend preview only */}
      <div className="flex items-start gap-2 text-amber-800 bg-amber-50 border border-amber-200 p-3 rounded text-xs font-semibold leading-relaxed">
        <ShieldOff className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
        <div>
          <span className="font-black uppercase tracking-wide">Dev note:</span> Authentication, role-based access control, and 2FA are currently <span className="underline">disabled</span> in this build. Login, role permissions, and the two-factor flow below are a frontend preview only — no backend enforcement exists yet.
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border text-sm font-bold gap-6">
        <button
          onClick={() => setActiveTab('thresholds')}
          className={`pb-3 flex items-center gap-1.5 transition-all relative ${activeTab === 'thresholds' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Sliders className="w-4 h-4" /> Model & Detection Thresholds
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`pb-3 flex items-center gap-1.5 transition-all relative ${activeTab === 'users' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Users className="w-4 h-4" /> User Management
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`pb-3 flex items-center gap-1.5 transition-all relative ${activeTab === 'audit' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <FileSpreadsheet className="w-4 h-4" /> Security Audit Log
        </button>
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
              {/* Slider 1 */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-700">Brake Crack Detection Threshold</span>
                  <span className="font-mono text-primary font-bold">{brakeThresh}%</span>
                </div>
                <input 
                  type="range" 
                  min="50" 
                  max="95" 
                  value={brakeThresh} 
                  onChange={(e) => setBrakeThresh(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <p className="text-[10px] text-muted-foreground">Alerts are generated if YOLO confidence matches or exceeds this limit.</p>
              </div>

              {/* Slider 2 */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-700">Loose Bogie Coupling Bolt Threshold</span>
                  <span className="font-mono text-primary font-bold">{boltThresh}%</span>
                </div>
                <input 
                  type="range" 
                  min="50" 
                  max="95" 
                  value={boltThresh} 
                  onChange={(e) => setBoltThresh(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <p className="text-[10px] text-muted-foreground">Lower limits catch more bolt issues but increase false anomaly reviews.</p>
              </div>

              {/* Slider 3 */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-700">Coach Number OCR Match Acceptance</span>
                  <span className="font-mono text-primary font-bold">{ocrThresh}%</span>
                </div>
                <input 
                  type="range" 
                  min="60" 
                  max="99" 
                  value={ocrThresh} 
                  onChange={(e) => setOcrThresh(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <p className="text-[10px] text-muted-foreground">Confidence limit required to auto-commit coach numbers without operator review.</p>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-border">
                {saveSuccess ? (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Threshold configs saved successfully.
                  </div>
                ) : (
                  <div />
                )}
                <button
                  type="submit"
                  disabled={isSaving}
                  className="bg-primary hover:bg-slate-800 text-white text-xs font-bold uppercase px-4 py-2 rounded shadow transition-all flex items-center gap-1.5 disabled:opacity-75"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving Changes...
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" /> Save Thresholds
                    </>
                  )}
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
                <span className={`inline-flex items-center text-[9px] font-bold px-2 py-0.5 rounded-full border ${ROLE_BADGE[role]}`}>
                  {ROLE_LABELS[role]}
                </span>
                <p className="text-[10px] text-muted-foreground leading-snug">{ROLE_DESCRIPTIONS[role]}</p>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center">
            <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider">Authorized Depot Personnel Registry</h3>
            <button
              onClick={() => setShowAddUser(true)}
              className="bg-primary hover:bg-slate-800 text-white text-xs font-bold uppercase px-3 py-1.5 rounded shadow transition-all flex items-center gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5" /> Register Inspector
            </button>
          </div>

          {showAddUser && (
            <form onSubmit={handleAddUser} className="bg-card border border-border rounded p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  autoFocus
                  value={newUser.name}
                  onChange={(e) => setNewUser((u) => ({ ...u, name: e.target.value }))}
                  placeholder="Name / designation"
                  className="px-3 py-2 border border-border rounded text-xs focus:outline-none focus:border-primary"
                />
                <input
                  value={newUser.zone}
                  onChange={(e) => setNewUser((u) => ({ ...u, zone: e.target.value }))}
                  placeholder="Depot zone"
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
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowAddUser(false)} className="text-xs font-bold px-3 py-1.5 border border-border rounded hover:bg-secondary">
                  Cancel
                </button>
                <button type="submit" className="text-xs font-bold px-3 py-1.5 bg-primary text-primary-foreground rounded">
                  Add User
                </button>
              </div>
            </form>
          )}

          <div className="bg-card border border-border rounded shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-border text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  <th className="p-3">User ID</th>
                  <th className="p-3">Designation</th>
                  <th className="p-3">Depot Zone</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">2FA</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-medium text-slate-700">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/50">
                    <td className="p-3 font-bold text-slate-900">{u.id}</td>
                    <td className="p-3">{u.name}</td>
                    <td className="p-3">{u.zone}</td>
                    <td className="p-3">
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        className={`text-[10px] font-bold px-2 py-1 rounded-full border ${ROLE_BADGE[u.role]} bg-transparent cursor-pointer`}
                      >
                        {Object.values(ROLES).map((role) => (
                          <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3">
                      {u.twoFactorEnabled ? (
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
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleRemoveUser(u.id)}
                        className="text-slate-400 hover:text-destructive transition-colors"
                        title="Remove user"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
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

          {twoFaTarget && (
            <TwoFactorSetupModal
              user={twoFaTarget}
              onClose={() => setTwoFaTarget(null)}
              onEnabled={handleEnable2fa}
            />
          )}
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded text-xs font-semibold leading-relaxed">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
            <div>Security alert: All threshold adjustments and report certifications are permanently logged to secure database ledger for safety auditing.</div>
          </div>

          <div className="bg-card border border-border rounded shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border bg-slate-50/50">
              <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider">Secured Administrative Log Audit Trail</h3>
            </div>
            <div className="p-0">
              <div className="divide-y divide-border text-xs">
                <div className="p-3 hover:bg-slate-50/50 flex justify-between items-center">
                  <div>
                    <span className="font-bold text-slate-800 font-mono">OPERATOR_319</span> signed off safety audit report for <span className="font-mono font-bold text-primary">VB-22901</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono">2026-05-20 01:30:01</div>
                </div>

                <div className="p-3 hover:bg-slate-50/50 flex justify-between items-center">
                  <div>
                    <span className="font-bold text-slate-800 font-mono">SYSTEM_DAEMON</span> auto-synchronized session <span className="font-mono font-bold text-primary">SES-22901-A</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono">2026-05-20 01:29:12</div>
                </div>

                <div className="p-3 hover:bg-slate-50/50 flex justify-between items-center">
                  <div>
                    <span className="font-bold text-slate-800 font-mono">OPERATOR_319</span> modified Brake Crack Detection confidence threshold from <span className="font-mono font-bold">80%</span> to <span className="font-mono font-bold">85%</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono">2026-05-20 01:10:42</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
