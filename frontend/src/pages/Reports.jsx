import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePolling } from '../hooks/usePolling';
import { getSessions, getReport, normalizeSession } from '../lib/api';
import { 
  FileText, 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Download, 
  Signature, 
  Eye, 
  X, 
  Award,
  Loader2,
  Train,
  Settings,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Activity,
  Sparkles,
  Info,
  CheckCircle,
  MoreVertical,
  SlidersHorizontal,
  ChevronLeft
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// Images from the HTML specs
const SPECS_IMAGES = {
  crackL: "https://lh3.googleusercontent.com/aida-public/AB6AXuA_lRTd-d2IBpqZMm12dxOVqF6ggiR1gdsLq3fBIuTzs-Wfa5hqlUoEToYtR-pgF2CLuF_7TyYYBo2oC9Vi3a15Xj5-1u5mgiuovIWPOPbhqic9Xe58KjKQ0DoXTgJWDboRDC3_vT3j-lCAlBe5BionHXiGBL2Kru-K7eZ6f2SE5vRML0U1dDj-WjEWUkoCYSb831QdULzWeAfgq827gUcW-_bv5Gc7Qtys9eho4A-nzAKQ06A2eSaAiNqTQxlGhivfKFLw5LLIj6eM",
  crackC: "https://lh3.googleusercontent.com/aida-public/AB6AXuBrHV2gwe54ztBQE59TA1la7NobjV-726UWtFejjnt3SyAMS3y2opO1d3OjCa6hKtRElbcTq4J-ndgHUn9yhkJMAbpbhYH9isXIBhy1elD6aPnIlpJIzNOhSeThLho-ZbKwL6KmdyUE_rbqmGKRNLhbK-gWkSiuhZ96akdc57t1RFl-FLReIts29wWE1sYwnDzdWSw1m1BgCpWJVARH3ArsBxddHzQNjFFUP1MpjHlA3z3XwpYFQwY7YbQdnKFC61TL4OWE81ZnoDWG",
  crackR: "https://lh3.googleusercontent.com/aida-public/AB6AXuDKAzP_kNSNrx7czuRCmcXZmTp2Jc4ABOd_KS35mLFCAHK0i4uBCc94Xi3TRDQ0-Bps1Kbjc5QI39NIv5FErBgtS-wcE8oZOqnqC3xYwgUvbMq5ylWlPHDayduasW4DhhrHx2NN0-gdCp3qZdTuu69i-J4DrrzI4QQDXadtGmZrJz5-gQRGszYwUMjw3XfmUvBoiDotpXHt9_Fm1bG4npaJUJASitt_ElG1IvUfBn4Cb-RjJeu0t_rAAlgsXD2vLta5_Cuq2ppx-Knc",
  scuffL: "https://lh3.googleusercontent.com/aida-public/AB6AXuAREsnjdkzZ8kGeUuGm4ltRMazYeuhowNjkMYy_bpp7Qyy8HJMcXhoLGUuUHflOkLk6QblN5cZPcDnQePR2IDXg2Wtr6dDSUcvSp4jTamaQDDMGiRqLinAOac69IBCYu_yM6ezehmlzPmjW01Mq4cRRV-r1_BBV4r9XLRp67vpv3r4ApxQY2VHHlcV8K4gZIKewRL3EloYK0NnbIyiVbj3FHzNJyXdtflzC8rGXgR1gZXb2oaLbJPAKszsqLi4PU5Hhrk0FaiQdtOrX",
  scuffC: "https://lh3.googleusercontent.com/aida-public/AB6AXuAR7ZbpaxfL1HPZjjDstLRszdnyLN_TTaL9VjNNhvlsKN9Ia-fcz7QspOyO6TWls6N25ZUikMFNBOEQaP55axfkFLGQ5RpdmeZDceUK6A7nORCIJEKpXYqeYCcdtERfYPuaQTE6Fb7IFggCZlPRFR1HKYRs_qqC-76SRAfr9RrBV8w0CRE2pr3CWuIZmwPciqxQ0Hy0b09VfG4KkWD4DKD65nKyb4HAMMeIlXddmfshDvO0dZjHBIq9uOeVMT6d98YhdUvQ1rFj_vd6",
  scuffR: "https://lh3.googleusercontent.com/aida-public/AB6AXuBLlLt72byTN6gSVOmZLkmLDojUK7FphGNPGqo3B-5lktIz8GGgGT7K3UBILEo5phEZRyoko6DCTuSIEvsMcpx2fS4cod88RU7U8CnppP5iT8KJgsBRQBCzoyiGMBQsdjs03KMu0L3VBFputuvEr-3D9qJy4wMvvKDCqcW56Nc_RGC6_CMbHYvV6SqlS1RdGKIDh4uQAU_g-XHn1a0KGKnhYHPsUxU55MrUk7KXhiUVfPvmMRrhlCoKjdC3Pow7X4Akz83PYqqKZyw6",
  nominalL: "https://lh3.googleusercontent.com/aida-public/AB6AXuDp-yAqkawZsis3uLYwWIUKYT54GH2yrk8_IIFBZ2maBB7EsgRiOljlWVRm0d3nbYYpbu-T0fI46IEoqlID21Lbb6d8I5QRoZHU1pQ1AEP8GX-6gKi0u1VT1QdwXjHgvUazZqhEYBIGoye0ErfNQNfye_rmmsr2ZhNZ0TzvbSjQykgwIGHUvLK46uqW1fzp24zoFF0FUoiFnbyJzoskjVunABk2vwoPyXmJfIbuVLg4V_yCOjP4Rn98jBWgr6npexnsF2jXbtgcuDpJ",
  nominalC: "https://lh3.googleusercontent.com/aida-public/AB6AXuByQ9SimdZcyIClLY8ie9ri_ZH5BfIsvN4nNtAtRCq48E2xAbtK09HzMVtW6Mu6A8dLxtxNPslPd-viyyv433LPFVCkG-VS8NUbylJFspP206oUj2JmauRUvQdU2Dfqcg91bt1fbgjKqQ60O8zfSy6FYEo-2PRs8TgMQpM0lY9-snosy0wws9udJjH6QO-J4S66cekg5nTlDfRx1pS2r03rWFdJhZSE3x9kCz68TJitAZnujx4WuR-xuF_biDqlORuxSfYLhIRCtd_a",
  nominalR: "https://lh3.googleusercontent.com/aida-public/AB6AXuBLlLt72byTN6gSVOmZLkmLDojUK7FphGNPGqo3B-5lktIz8GGgGT7K3UBILEo5phEZRyoko6DCTuSIEvsMcpx2fS4cod88RU7U8CnppP5iT8KJgsBRQBCzoyiGMBQsdjs03KMu0L3VBFputuvEr-3D9qJy4wMvvKDCqcW56Nc_RGC6_CMbHYvV6SqlS1RdGKIDh4uQAU_g-XHn1a0KGKnhYHPsUxU55MrUk7KXhiUVfPvmMRrhlCoKjdC3Pow7X4Akz83PYqqKZyw6"
};

// Map a normalized session to the shape Reports UI expects
function sessionToReport(s) {
  return {
    id: s.id,
    trainNumber: s.trainNumber,
    date: s.completedAt ? new Date(s.completedAt).toISOString().slice(0, 10) : new Date(s.startedAt).toISOString().slice(0, 10),
    supervisor: 'Awaiting Signature',
    status: s.criticalDefects > 0 ? 'PENDING_SIGNATURE' : 'APPROVED',
    criticalDefects: s.criticalDefects || 0,
    minorDefects: 0,
    totalCoaches: s.totalCoaches || 0,
    ocrConf: s.ocrConfidence || 0,
    syncStability: s.syncHealth || 0,
    verifiedComponentsCount: s.totalFrames || 0,
    pdfUrl: null, // loaded on demand
  };
}

export const Reports = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Load sessions from API, derive reports from completed ones
  const { data: sessionsData } = usePolling(getSessions, 15000);
  const [reportOverrides, setReportOverrides] = useState({}); // sessionId -> { pdfUrl }

  const reports = ((sessionsData?.sessions || [])
    .filter(s => s.status === 'completed' || s.status === 'analysing')
    .map(normalizeSession)
    .map(sessionToReport)
  ).map(r => ({ ...r, ...(reportOverrides[r.id] || {}) }));

  const [localStatusOverrides, setLocalStatusOverrides] = useState({}); // id -> status
  const displayReports = reports.map(r => ({
    ...r,
    status: localStatusOverrides[r.id] || r.status
  }));
  
  // Navigation & detailed report workspace state
  const [selectedReport, setSelectedReport] = useState(null);
  const [activeCoach, setActiveCoach] = useState('B1');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadPercent, setPlayheadPercent] = useState(31.5);
  const [playbackTime, setPlaybackTime] = useState('00:01:22');
  const [isMuted, setIsMuted] = useState(false);

  // Operator review actions
  const [pendingReviews, setPendingReviews] = useState(3);
  const [showReviewCard, setShowReviewCard] = useState(true);

  // Dialog state
  const [signingReport, setSigningReport] = useState(null);
  const [pinInput, setPinInput] = useState('');
  const [isSigningLoading, setIsSigningLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(null); // report ID

  const handleDownload = async (report) => {
    // Try to get the real PDF URL first
    if (report.pdfUrl) {
      window.open(report.pdfUrl, '_blank');
      return;
    }
    setIsDownloading(report.id);
    try {
      const data = await getReport(report.id);
      if (data?.pdf_url) {
        setReportOverrides(prev => ({ ...prev, [report.id]: { pdfUrl: data.pdf_url } }));
        window.open(data.pdf_url, '_blank');
      }
    } catch (_) {
      alert('Report PDF not yet available. Generate it first from the session workspace.');
    } finally {
      setIsDownloading(null);
    }
  };

  const handleSign = (e) => {
    e.preventDefault();
    if (!pinInput || pinInput !== '1234') {
      alert('Invalid Security Pin. Please enter the supervisor authorization PIN (1234).');
      return;
    }
    setIsSigningLoading(true);
    setTimeout(() => {
      setLocalStatusOverrides(prev => ({ ...prev, [signingReport.id]: 'APPROVED' }));
      if (selectedReport && selectedReport.id === signingReport.id) {
        setSelectedReport(prev => ({ ...prev, status: 'APPROVED' }));
      }
      setIsSigningLoading(false);
      setSigningReport(null);
      setPinInput('');
    }, 1500);
  };

  // Playhead auto-update simulation
  useEffect(() => {
    let interval;
    if (isPlaying) {
      interval = setInterval(() => {
        setPlayheadPercent(prev => {
          let next = prev + 0.5;
          if (next > 100) next = 0;
          
          // Map playhead percent to timeline timestamps
          const totalSeconds = 261; // 4:21 total
          const currentSeconds = Math.floor((next / 100) * totalSeconds);
          const min = String(Math.floor(currentSeconds / 60)).padStart(2, '0');
          const sec = String(currentSeconds % 60).padStart(2, '0');
          setPlaybackTime(`00:${min}:${sec}`);

          // Sync active coach based on percent regions
          if (next < 10) setActiveCoach('B1');
          else if (next < 20) setActiveCoach('B2');
          else if (next < 30) setActiveCoach('B3');
          else if (next < 40) setActiveCoach('B4');
          else if (next < 50) setActiveCoach('B5');
          else if (next < 60) setActiveCoach('B6');
          else setActiveCoach('B7');

          return next;
        });
      }, 150);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Jump to specific coach / defect
  const jumpToCoach = (coachNum) => {
    setActiveCoach(coachNum);
    if (coachNum === 'B1') {
      setPlayheadPercent(31.5);
      setPlaybackTime('00:01:22');
    } else if (coachNum === 'B2') {
      setPlayheadPercent(38.2);
      setPlaybackTime('00:01:39');
    } else {
      const coachIndex = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'].indexOf(coachNum);
      const targetPercent = coachIndex * 14.2 + 7.1;
      setPlayheadPercent(targetPercent);
      const totalSeconds = 261;
      const currentSeconds = Math.floor((targetPercent / 100) * totalSeconds);
      const min = String(Math.floor(currentSeconds / 60)).padStart(2, '0');
      const sec = String(currentSeconds % 60).padStart(2, '0');
      setPlaybackTime(`00:${min}:${sec}`);
    }
  };

  const filteredReports = displayReports.filter(rep => {
    const matchesSearch = rep.trainNumber.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          rep.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || rep.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Render detailed Report Generation Workspace
  if (selectedReport) {
    // Dynamic data based on active coach selection
    let activeDefect = null;
    let coachBreakdown = {
      title: `Coach ${activeCoach} Breakdown`,
      healthScore: 100,
      complianceScore: 100,
      stressScore: 35,
      items: [
        { name: "Suspension Units", value: "4/4 NOMINAL", isError: false },
        { name: "Axle Bearings", value: "8/8 NOMINAL", isError: false },
        { name: "Brake Pad Wear", value: "NOMINAL", isError: false }
      ]
    };

    if (activeCoach === 'B1') {
      activeDefect = {
        name: "CRITICAL DEFECT: Brake Assembly Crack",
        ref: "DEF-B1-009",
        timestamp: "T: 00:01:22.45",
        cams: [SPECS_IMAGES.crackL, SPECS_IMAGES.crackC, SPECS_IMAGES.crackR],
        aiReasoning: "Structural discontinuity detected across 14 synchronized frames. Fracture geometry exceeds 3mm safety threshold. 94.4% probability of propagation within 500km.",
        confidence: 92
      };
      coachBreakdown = {
        title: "Coach B1 Breakdown",
        healthScore: 82,
        complianceScore: 100,
        stressScore: 64,
        items: [
          { name: "Suspension Units", value: "4/4 NOMINAL", isError: false },
          { name: "Axle Bearings", value: "8/8 NOMINAL", isError: false },
          { name: "Brake Pad Wear", value: "REPLACE AT DEPOT", isError: true }
        ]
      };
    } else if (activeCoach === 'B2') {
      activeDefect = {
        name: "CRITICAL DEFECT: Wheel Tread Scuffing",
        ref: "DEF-B2-012",
        timestamp: "T: 00:01:39.12",
        cams: [SPECS_IMAGES.scuffL, SPECS_IMAGES.scuffC, SPECS_IMAGES.scuffR],
        aiReasoning: "AI flagged possible scuffing and flat-spot patterns on the inner tread of B2. Heat signature indicates moderate friction build-up.",
        confidence: 88
      };
      coachBreakdown = {
        title: "Coach B2 Breakdown",
        healthScore: 78,
        complianceScore: 92,
        stressScore: 58,
        items: [
          { name: "Suspension Units", value: "4/4 NOMINAL", isError: false },
          { name: "Axle Bearings", value: "8/8 NOMINAL", isError: false },
          { name: "Brake Pad Wear", value: "MONITOR TEMPERATURE", isError: true }
        ]
      };
    } else {
      coachBreakdown = {
        title: `Coach ${activeCoach} Breakdown`,
        healthScore: 100,
        complianceScore: 100,
        stressScore: 28,
        items: [
          { name: "Suspension Units", value: "4/4 NOMINAL", isError: false },
          { name: "Axle Bearings", value: "8/8 NOMINAL", isError: false },
          { name: "Brake Pad Wear", value: "NOMINAL", isError: false }
        ]
      };
    }

    return (
      <div className="flex flex-col h-[calc(100vh-4rem)] bg-[#faf9ff] overflow-hidden font-sans">
        
        {/* Operational Sub-Header */}
        <div className="bg-white border-b border-slate-200 px-6 py-3 flex flex-wrap justify-between items-center gap-4 z-10 shrink-0 shadow-sm">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSelectedReport(null)}
              className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-500 hover:text-slate-950 border border-slate-200 bg-white"
              title="Back to Reports"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-[10px] bg-slate-100 text-slate-800 border border-slate-200 px-2 py-0.5 rounded">
                  TRAIN {selectedReport.trainNumber}
                </span>
                <span className="text-slate-500 text-xs font-mono font-bold">
                  / SESSION: INS-2026-0045
                </span>
                <span className="ml-2">
                  {selectedReport.status === 'APPROVED' ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Certified
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                      Pending Sign-off
                    </span>
                  )}
                </span>
              </div>
              <div className="flex gap-4 mt-1 text-[10px] font-mono text-slate-400 font-bold uppercase">
                <div className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> <span>00:04:21</span></div>
                <div className="flex items-center gap-1"><Train className="w-3.5 h-3.5" /> <span>{selectedReport.totalCoaches} Coaches</span></div>
                <div className="flex items-center gap-1 text-red-600 font-extrabold"><AlertTriangle className="w-3.5 h-3.5" /> <span>{selectedReport.criticalDefects} Critical Defects</span></div>
              </div>
            </div>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={() => handleDownload(selectedReport.id)}
              disabled={isDownloading === selectedReport.id}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-primary text-xs font-bold uppercase tracking-wider transition-all rounded shadow-sm"
            >
              {isDownloading === selectedReport.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileText className="w-3.5 h-3.5" />
              )}
              EXPORT PDF
            </button>
            <button 
              onClick={() => alert("Evidence bundle created for VB-22901.")}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-primary text-xs font-bold uppercase tracking-wider transition-all rounded shadow-sm"
            >
              <Download className="w-3.5 h-3.5" /> EXPORT EVIDENCE BUNDLE
            </button>
            {selectedReport.status === 'PENDING_SIGNATURE' ? (
              <button 
                onClick={() => setSigningReport(selectedReport)}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-primary hover:bg-slate-800 text-white text-xs font-bold uppercase tracking-wider transition-all rounded shadow-md"
              >
                <Signature className="w-3.5 h-3.5" /> OPERATOR APPROVAL
              </button>
            ) : (
              <div className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 text-white text-xs font-bold uppercase tracking-wider rounded shadow-sm">
                <CheckCircle2 className="w-3.5 h-3.5" /> SIGNED & APPROVED
              </div>
            )}
          </div>
        </div>

        {/* Main Workspace Layout */}
        <main className="flex-1 flex overflow-hidden relative">
          
          {/* Left Panel: Inspection Hierarchy */}
          <aside className="w-72 bg-slate-50/50 border-r border-slate-200 flex flex-col shrink-0">
            <div className="p-4 border-b border-slate-200 bg-slate-100/50">
              <p className="text-[10px] font-black text-slate-400 tracking-wider uppercase">Inspection Hierarchy</p>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {/* Train Node */}
              <div className="flex items-center gap-2 p-2 bg-slate-200/80 text-slate-800 font-bold rounded cursor-pointer text-xs">
                <Train className="w-4 h-4 text-primary" />
                <span>Train VB22901</span>
              </div>
              
              {/* Nested Coaches */}
              <div className="ml-4 space-y-1 border-l-2 border-slate-200 pl-2">
                {[
                  { num: 'B1', hasDefect: true },
                  { num: 'B2', hasDefect: true },
                  { num: 'B3', hasDefect: false },
                  { num: 'B4', hasDefect: false },
                  { num: 'B5', hasDefect: false },
                  { num: 'B6', hasDefect: false },
                  { num: 'B7', hasDefect: false }
                ].map(coach => (
                  <div 
                    key={coach.num}
                    onClick={() => jumpToCoach(coach.num)}
                    className={`flex items-center justify-between p-2 rounded text-xs transition-colors cursor-pointer ${activeCoach === coach.num ? 'bg-primary/10 font-bold text-primary border border-primary/20' : 'hover:bg-slate-100 text-slate-600'}`}
                  >
                    <div className="flex items-center gap-2">
                      {coach.hasDefect ? (
                        <AlertTriangle className="w-4 h-4 text-red-600" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-slate-400" />
                      )}
                      <span>Coach {coach.num}</span>
                    </div>
                    {coach.hasDefect && (
                      <span className="bg-red-600 text-white text-[8px] font-bold px-1 py-0.25 rounded uppercase">
                        Defect
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Hierarchy Footer */}
            <div className="p-4 bg-slate-100 border-t border-slate-200 space-y-3">
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase">
                <span>System Health</span>
                <span className="text-emerald-600 font-extrabold">OPTIMAL</span>
              </div>
              <button 
                onClick={() => alert("Workspace settings configuration.")}
                className="w-full flex items-center justify-center gap-2 p-2 bg-white hover:bg-slate-50 border border-slate-200 rounded text-xs font-bold text-slate-700 transition-all shadow-sm"
              >
                <Settings className="w-4 h-4 text-slate-500" />
                Workspace Settings
              </button>
            </div>
          </aside>

          {/* Center Panel: Report Workspace */}
          <section className="flex-1 overflow-y-auto bg-slate-50/20 flex flex-col p-6 space-y-6">
            
            {/* Inspection Summary Banner */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white border border-slate-200 p-4 rounded shadow-sm flex flex-col justify-center gap-2">
                <span className="text-[10px] font-black text-slate-400 uppercase">Health Score</span>
                <div className="flex items-center gap-3">
                  <span className="text-xl font-black text-primary">{coachBreakdown.healthScore}%</span>
                  <div className="h-2 flex-1 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-500 ${coachBreakdown.healthScore > 80 ? 'bg-primary' : 'bg-red-500'}`} 
                      style={{ width: `${coachBreakdown.healthScore}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 p-4 rounded shadow-sm flex justify-between items-center">
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase block">Sync Confidence</span>
                  <span className="text-lg font-black text-slate-800">98.2%</span>
                </div>
                <Activity className="text-primary w-8 h-8 opacity-80" />
              </div>

              <div className="bg-white border border-slate-200 p-4 rounded shadow-sm flex justify-between items-center">
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase block">OCR Accuracy</span>
                  <span className="text-lg font-black text-slate-800">97.1%</span>
                </div>
                <Sparkles className="text-primary w-8 h-8 opacity-80" />
              </div>
            </div>

            {/* Defect Evidence Card */}
            {activeDefect ? (
              <div className="bg-white border border-slate-200 rounded shadow-sm overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 bg-red-600 rounded-full animate-pulse"></span>
                    <span className="text-xs font-black text-slate-800 uppercase tracking-tight">
                      {activeDefect.name}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 font-bold">
                      REF: {activeDefect.ref}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-slate-400 font-bold">{activeDefect.timestamp}</span>
                    <MoreVertical className="w-4 h-4 text-slate-400 cursor-pointer hover:text-primary" />
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-4">
                  {/* Multicam View */}
                  <div className="xl:col-span-3 p-4 grid grid-cols-3 gap-2 bg-slate-950">
                    {activeDefect.cams.map((src, i) => (
                      <div key={i} className="relative aspect-video bg-black overflow-hidden border border-white/10 group rounded">
                        <img 
                          className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" 
                          src={src} 
                          alt={`Camera feed ${i+1}`}
                        />
                        <div className="absolute inset-0 border-2 border-primary/20 pointer-events-none"></div>
                        <div className="absolute top-2 left-2 bg-black/60 px-1.5 py-0.5 rounded text-[8px] font-mono text-white">
                          {i === 0 ? 'CAM_01_L' : i === 1 ? 'CAM_02_C' : 'CAM_03_R'}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* AI Reasoning */}
                  <div className="p-4 flex flex-col gap-4 bg-white">
                    <div>
                      <span className="text-[10px] font-black text-primary uppercase block">AI Reasoning</span>
                      <p className="text-xs font-medium text-slate-700 leading-relaxed mt-2 italic">
                        "{activeDefect.aiReasoning}"
                      </p>
                    </div>

                    <div className="mt-auto pt-4 border-t border-slate-100">
                      <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase mb-1">
                        <span>Confidence Level</span>
                        <span>{activeDefect.confidence}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary" 
                          style={{ width: `${activeDefect.confidence}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded p-8 shadow-sm flex flex-col items-center justify-center text-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mb-3" />
                <h4 className="text-sm font-bold text-slate-800 uppercase">Coach {activeCoach} Nominal</h4>
                <p className="text-xs text-slate-500 max-w-sm mt-1">
                  Machine vision analysis shows no anomalies. All primary suspension structures and braking components are within baseline tolerances.
                </p>
              </div>
            )}

            {/* Secondary Intelligence Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white border border-slate-200 p-4 rounded shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle className="w-4 h-4 text-primary" />
                  <h3 className="text-xs font-black uppercase text-slate-800">{coachBreakdown.title}</h3>
                </div>
                
                <div className="space-y-2">
                  {coachBreakdown.items.map((item, i) => (
                    <div 
                      key={i} 
                      className={`flex justify-between p-2 text-xs border border-transparent rounded transition-all ${item.isError ? 'bg-red-50 border-red-200 font-bold text-red-700' : 'hover:bg-slate-50 text-slate-600'}`}
                    >
                      <span>{item.name}</span>
                      <span className="font-mono">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-slate-200 p-4 rounded shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Activity className="w-4 h-4 text-primary" />
                  <h3 className="text-xs font-black uppercase text-slate-800">Structural Compliance</h3>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full border-2 border-primary flex items-center justify-center font-bold text-primary text-xs shrink-0">
                      {coachBreakdown.complianceScore}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">IRS-S6 Compliance</p>
                      <p className="text-[10px] text-slate-400 font-medium">Indian Railway Safety Standard Ver 2024.1</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold text-xs shrink-0 ${coachBreakdown.stressScore > 60 ? 'border-red-500 text-red-500' : 'border-primary text-primary'}`}>
                      {coachBreakdown.stressScore}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">Bogie Stress Score</p>
                      <p className="text-[10px] text-slate-400 font-medium">Aggregated vibration and visual stress index</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </section>

          {/* Right Panel: Operator Review & System Load */}
          <aside className="w-80 border-l border-slate-200 bg-white flex flex-col shrink-0">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <span className="text-[10px] font-black text-slate-700 uppercase">Operator Review</span>
              <span className="bg-primary text-white text-[9px] font-black px-2 py-0.5 rounded-full">
                {pendingReviews} PENDING
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {showReviewCard ? (
                <div className="border border-slate-200 p-4 space-y-3 hover:border-primary cursor-pointer transition-all bg-slate-50/50 rounded">
                  <div className="flex justify-between items-start">
                    <span className="text-[9px] font-black bg-slate-200 text-slate-800 px-2 py-0.5 rounded uppercase">HIGH PRIO</span>
                    <span className="text-slate-400 text-[10px] font-medium">2m ago</span>
                  </div>
                  <p className="text-xs font-bold text-slate-800">Verify B2 Wheel Scuffing</p>
                  <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
                    AI flagged possible scuffing on inner tread of B2. Manual validation required for final report inclusion.
                  </p>
                  <div className="flex gap-2 pt-1">
                    <button 
                      onClick={() => {
                        setShowReviewCard(false);
                        setPendingReviews(prev => prev - 1);
                      }}
                      className="flex-1 py-1 text-[10px] font-black border border-primary text-primary hover:bg-primary hover:text-white transition-all rounded"
                    >
                      DISMISS
                    </button>
                    <button 
                      onClick={() => {
                        setShowReviewCard(false);
                        setPendingReviews(prev => prev - 1);
                        jumpToCoach('B2');
                      }}
                      className="flex-1 py-1 text-[10px] font-black bg-primary text-white hover:opacity-90 rounded"
                    >
                      CONFIRM
                    </button>
                  </div>
                </div>
              ) : (
                <div className="border border-dashed border-slate-200 p-4 rounded text-center text-xs text-slate-400 font-medium">
                  All high priority reviews complete.
                </div>
              )}

              {/* Compliance Health */}
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">System Health Monitor</span>
                <div className="flex justify-between items-center text-xs text-slate-600">
                  <span>Edge Compute Latency</span>
                  <span className="font-mono text-primary font-bold">12ms</span>
                </div>
                <div className="flex justify-between items-center text-xs text-slate-600">
                  <span>Neural Core Load</span>
                  <span className="font-mono text-primary font-bold">42%</span>
                </div>
                <div className="flex justify-between items-center text-xs text-slate-600">
                  <span>Data Redundancy</span>
                  <span className="font-mono text-slate-400 font-bold">OK</span>
                </div>
              </div>
            </div>

            {/* Profile Sign-off badge */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center gap-3">
              <div className="w-9 h-9 bg-primary text-white flex items-center justify-center font-bold text-xs rounded">
                RV
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-800">Rahul Varma</span>
                <span className="text-[9px] text-slate-400 uppercase font-black tracking-wider">Senior Inspector L3</span>
              </div>
            </div>
          </aside>

        </main>

        {/* Bottom Playback Timeline / Media Strip */}
        <footer className="h-20 w-full bg-slate-900 border-t border-white/10 flex items-center px-6 shrink-0 z-10">
          <div className="flex items-center gap-3 mr-6 shrink-0">
            <button 
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded transition-colors"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
            </button>
            <span className="text-white font-mono text-xs tracking-wider">{playbackTime} / 00:04:21</span>
          </div>

          <div className="flex-1 relative h-10 flex items-center">
            {/* Timeline Track */}
            <div className="w-full h-1 bg-white/20 rounded-full" />
            
            {/* Defect Markers */}
            <div 
              onClick={() => jumpToCoach('B1')}
              className="absolute left-[31.5%] -top-1 cursor-pointer group flex flex-col items-center"
            >
              <div className="w-3 h-3 bg-red-600 rounded-full border-2 border-white hover:scale-130 transition-transform shadow" />
              <div className="absolute -bottom-6 text-[8px] text-red-500 font-bold bg-slate-900 border border-red-900/40 px-1 rounded whitespace-nowrap">DEF-01</div>
            </div>

            <div 
              onClick={() => jumpToCoach('B2')}
              className="absolute left-[38.2%] -top-1 cursor-pointer group flex flex-col items-center"
            >
              <div className="w-3 h-3 bg-red-600 rounded-full border-2 border-white hover:scale-130 transition-transform shadow" />
              <div className="absolute -bottom-6 text-[8px] text-red-500 font-bold bg-slate-900 border border-red-900/40 px-1 rounded whitespace-nowrap">DEF-02</div>
            </div>

            {/* Playhead */}
            <div 
              className="absolute h-8 w-0.5 bg-primary shadow-[0_0_8px_#0052cc] z-20 pointer-events-none transition-all duration-150"
              style={{ left: `${playheadPercent}%` }}
            />

            {/* Coach Blocks Grid */}
            <div className="absolute inset-0 flex items-end pb-1 pointer-events-none">
              {['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'].map((coach, idx) => (
                <div 
                  key={coach} 
                  className={`w-[14.2%] border-r border-white/10 text-[9px] font-mono font-bold pl-2 cursor-pointer pointer-events-auto select-none ${activeCoach === coach ? 'text-primary font-black' : 'text-white/30 hover:text-white/60'}`}
                  onClick={() => jumpToCoach(coach)}
                >
                  {coach}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4 ml-6 shrink-0 text-white/60">
            <button 
              onClick={() => setIsMuted(!isMuted)}
              className="hover:text-white transition-colors"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button className="hover:text-white transition-colors">
              <Maximize className="w-4 h-4" />
            </button>
            <div className="w-px h-6 bg-white/20" />
            <span className="font-mono text-[9px] uppercase font-bold tracking-wider">Codec: HEVC-10bit</span>
          </div>
        </footer>

        {/* Digital Signature Dialog inside workspace */}
        {signingReport && (
          <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <div className="bg-white rounded-lg border border-slate-200 max-w-md w-full shadow-2xl p-6 relative">
              <button 
                onClick={() => setSigningReport(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="space-y-4">
                <div className="flex items-center gap-2.5 text-amber-600">
                  <Signature className="w-5 h-5" />
                  <h3 className="text-md font-black tracking-tight uppercase">Supervisor Digital Authorization</h3>
                </div>

                <div className="text-xs text-slate-500 space-y-1.5 leading-relaxed bg-slate-50 p-3 rounded border border-slate-200">
                  <p><strong>REPORT ID:</strong> {signingReport.id}</p>
                  <p><strong>TRAIN ID:</strong> {signingReport.trainNumber}</p>
                  <p><strong>SAFETY DETECTED:</strong> {signingReport.criticalDefects} Critical Defects, {signingReport.minorDefects} Minor Defects</p>
                  <p><strong>SUPERVISOR ASSIGNED:</strong> {signingReport.supervisor}</p>
                </div>

                <form onSubmit={handleSign} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Authorization PIN</label>
                    <input
                      type="password"
                      placeholder="Enter Security PIN (Try 1234)..."
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded text-sm focus:outline-none focus:border-primary font-mono text-slate-900 bg-white"
                      required
                    />
                  </div>

                  <div className="flex gap-2 justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => setSigningReport(null)}
                      className="px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded text-xs font-bold uppercase"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSigningLoading}
                      className="px-4 py-2 bg-primary hover:bg-slate-800 text-white rounded text-xs font-bold uppercase flex items-center gap-1.5 shadow-md disabled:opacity-75"
                    >
                      {isSigningLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Confirm Signature
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

      </div>
    );
  }

  // Default List View
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black tracking-tight text-foreground">AUDIT & COMPLIANCE REPORTS</h1>
        <p className="text-sm text-muted-foreground mt-1">Review, certify, and download official inspection safety records.</p>
      </div>

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border p-4 rounded shadow-sm flex items-center gap-4">
          <div className="p-3 rounded bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Certified Reports</div>
            <div className="text-2xl font-black text-foreground">
              {displayReports.filter(r => r.status === 'APPROVED').length}
            </div>
          </div>
        </div>

        <div className="bg-card border border-border p-4 rounded shadow-sm flex items-center gap-4">
          <div className="p-3 rounded bg-amber-100 text-amber-700">
            <Clock className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Awaiting Signature</div>
            <div className="text-2xl font-black text-foreground">
              {displayReports.filter(r => r.status === 'PENDING_SIGNATURE').length}
            </div>
          </div>
        </div>

        <div className="bg-card border border-border p-4 rounded shadow-sm flex items-center gap-4">
          <div className="p-3 rounded bg-primary/10 text-primary">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Evaluated</div>
            <div className="text-2xl font-black text-foreground">{displayReports.length}</div>
          </div>
        </div>
      </div>

      {/* Filter Options */}
      <div className="bg-card border border-border p-4 rounded shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 min-w-[280px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by Train ID or Report ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-4 py-2 w-full rounded border border-border bg-slate-50 text-sm focus:outline-none focus:border-primary focus:bg-white transition-all text-slate-900"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-50 border border-border rounded p-1 text-xs font-bold">
            <span className="px-2 text-muted-foreground">Certification Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent border-none focus:ring-0 cursor-pointer font-bold text-primary"
            >
              <option value="ALL">All Reports</option>
              <option value="APPROVED">Approved & Certified</option>
              <option value="PENDING_SIGNATURE">Pending Signature</option>
            </select>
          </div>
        </div>
      </div>

      {/* Reports Table */}
      <div className="bg-card border border-border rounded shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-border text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <th className="p-4">Report ID</th>
                <th className="p-4">Train ID</th>
                <th className="p-4">Date Generated</th>
                <th className="p-4">Assigned Supervisor</th>
                <th className="p-4 text-center">Defects (Crit/Min)</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm">
              {filteredReports.length === 0 && (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-muted-foreground font-medium text-sm">
                    No completed sessions with reports found. Run a pipeline inspection first.
                  </td>
                </tr>
              )}
              {filteredReports.map(rep => (
                <tr key={rep.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 font-mono font-bold text-slate-800">{rep.id}</td>
                  <td className="p-4 font-mono font-bold text-primary">{rep.trainNumber}</td>
                  <td className="p-4 text-slate-600 font-medium">{rep.date}</td>
                  <td className="p-4 text-xs font-semibold text-slate-500">{rep.supervisor}</td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-1.5 font-mono text-xs font-bold">
                      <span className={rep.criticalDefects > 0 ? 'text-red-600' : 'text-slate-400'}>
                        {rep.criticalDefects} Crit
                      </span>
                      <span className="text-slate-300">/</span>
                      <span className={rep.minorDefects > 0 ? 'text-amber-600' : 'text-slate-400'}>
                        {rep.minorDefects} Minor
                      </span>
                    </div>
                  </td>
                  <td className="p-4">
                    {rep.status === 'APPROVED' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Certified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-emerald-200">
                        <Clock className="w-3.5 h-3.5 animate-pulse" /> Pending Sign-off
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setSelectedReport(rep)}
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-500 flex items-center gap-1.5 text-xs font-bold text-primary border border-transparent hover:border-slate-200"
                        title="View Report Workspace"
                      >
                        <Eye className="w-4 h-4 text-primary" /> View Workspace
                      </button>
                      
                      {rep.status === 'PENDING_SIGNATURE' ? (
                        <button
                          onClick={() => setSigningReport(rep)}
                          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded text-xs font-bold transition-all shadow-sm"
                        >
                          <Signature className="w-3.5 h-3.5" /> Sign Report
                        </button>
                      ) : (
                        <button
                          onClick={() => handleDownload(rep)}
                          disabled={isDownloading === rep.id}
                          className="flex items-center gap-1.5 bg-primary hover:bg-slate-800 text-white px-3 py-1.5 rounded text-xs font-bold transition-all shadow-sm disabled:opacity-75"
                        >
                          {isDownloading === rep.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          PDF
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Digital Signature Dialog */}
      {signingReport && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-lg border border-slate-200 max-w-md w-full shadow-2xl p-6 relative">
            <button 
              onClick={() => setSigningReport(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-4">
              <div className="flex items-center gap-2.5 text-amber-600">
                <Signature className="w-5 h-5" />
                <h3 className="text-md font-black tracking-tight uppercase">Supervisor Digital Authorization</h3>
              </div>

              <div className="text-xs text-slate-500 space-y-1.5 leading-relaxed bg-slate-50 p-3 rounded border border-slate-200">
                <p><strong>REPORT ID:</strong> {signingReport.id}</p>
                <p><strong>TRAIN ID:</strong> {signingReport.trainNumber}</p>
                <p><strong>SAFETY DETECTED:</strong> {signingReport.criticalDefects} Critical Defects, {signingReport.minorDefects} Minor Defects</p>
                <p><strong>SUPERVISOR ASSIGNED:</strong> {signingReport.supervisor}</p>
              </div>

              <form onSubmit={handleSign} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Authorization PIN</label>
                  <input
                    type="password"
                    placeholder="Enter Security PIN (Try 1234)..."
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded text-sm focus:outline-none focus:border-primary font-mono text-slate-900 bg-white"
                    required
                  />
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setSigningReport(null)}
                    className="px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded text-xs font-bold uppercase"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSigningLoading}
                    className="px-4 py-2 bg-primary hover:bg-slate-800 text-white rounded text-xs font-bold uppercase flex items-center gap-1.5 shadow-md disabled:opacity-75"
                  >
                    {isSigningLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Confirm Signature
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
