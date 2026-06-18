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
  AlertTriangle 
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export const Settings = () => {
  const [activeTab, setActiveTab] = useState('thresholds');
  
  // State for thresholds
  const [ocrThresh, setOcrThresh] = useState(85);
  const [brakeThresh, setBrakeThresh] = useState(80);
  const [boltThresh, setBoltThresh] = useState(75);
  
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

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

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black tracking-tight text-foreground">ADMINISTRATIVE SETTINGS</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure computer vision model thresholds, manage inspector profiles, and review audit logs.</p>
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
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider">Authorized Depot Personnel Registry</h3>
            <button className="bg-primary hover:bg-slate-800 text-white text-xs font-bold uppercase px-3 py-1.5 rounded shadow transition-all flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5" /> Register Inspector
            </button>
          </div>

          <div className="bg-card border border-border rounded shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-border text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  <th className="p-3">User ID</th>
                  <th className="p-3">Designation / Role</th>
                  <th className="p-3">Depot Zone</th>
                  <th className="p-3">Digital PIN Access</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-medium text-slate-700">
                <tr className="hover:bg-slate-50/50">
                  <td className="p-3 font-bold text-slate-900">OPERATOR_319</td>
                  <td className="p-3">Senior Section Engineer (Supervisor)</td>
                  <td className="p-3">Western Railway (Mumbai Central CDO)</td>
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <ShieldCheck className="w-3 h-3" /> VERIFIED SIGNER
                    </span>
                  </td>
                  <td className="p-3 text-right text-slate-400 hover:text-slate-600 cursor-pointer font-bold">Edit</td>
                </tr>
                <tr className="hover:bg-slate-50/50">
                  <td className="p-3 font-bold text-slate-900">OPERATOR_320</td>
                  <td className="p-3">Junior Depot Officer (Duty Desk)</td>
                  <td className="p-3">Northern Railway (New Delhi CDO)</td>
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                      VIEW & REVIEW ONLY
                    </span>
                  </td>
                  <td className="p-3 text-right text-slate-400 hover:text-slate-600 cursor-pointer font-bold">Edit</td>
                </tr>
              </tbody>
            </table>
          </div>
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
