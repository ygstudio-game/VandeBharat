import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSessions, uploadSession, normalizeSession, getConfig, deleteSession, searchCoaches } from '../lib/api';
import { useSessionSocket } from '../hooks/useSessionSocket';
import { toast } from '../hooks/useToast';
import { 
  Search, 
  Calendar, 
  Filter, 
  Train, 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  SlidersHorizontal, 
  Download, 
  Eye, 
  MoreVertical,
  ChevronDown,
  ChevronUp,
  Clock,
  Sparkles,
  RefreshCw,
  X,
  Plus,
  Trash2,
  Edit2,
  Upload,
  Play,
  Check,
  Terminal,
  FileText,
  Loader2,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const Sessions = ({ lockedStation = null }) => {
  const navigate = useNavigate();
  const embedded = !!lockedStation;
  
  // CRUD state management
  const [sessions, setSessions] = useState([]);
  const [uploadError, setUploadError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [deletingIds, setDeletingIds] = useState(new Set());

  // Coach search — moved here from the standalone Coach Search page
  const [coachQuery, setCoachQuery] = useState('');
  const [coachResults, setCoachResults] = useState(null);
  const [coachSearching, setCoachSearching] = useState(false);
  const [coachSearched, setCoachSearched] = useState(false);

  const runCoachSearch = useCallback(async (q) => {
    if (!q.trim()) return;
    setCoachSearching(true);
    setCoachSearched(true);
    try {
      const data = await searchCoaches(q.trim());
      setCoachResults(data.coaches || []);
    } catch {
      setCoachResults([]);
    } finally {
      setCoachSearching(false);
    }
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      const data = await getSessions();
      setSessions((data.sessions || []).map(normalizeSession).filter(s => !deletingIds.has(s.id)));
    } catch (_) { /* silent — keep stale data */ }
  }, [deletingIds]);

  useEffect(() => {
    loadSessions();
    const t = setInterval(loadSessions, 5000);
    return () => clearInterval(t);
  }, [loadSessions]);

  // Live WS events — immediate refresh + toast on key transitions
  const { lastEvent } = useSessionSocket(null);
  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.type === 'session_completed') {
      loadSessions();
      toast.success('Inspection pipeline complete.', `Session Done`);
    } else if (lastEvent.type === 'session_failed') {
      loadSessions();
      toast.error('Pipeline error — check the workspace for details.', 'Session Failed');
    } else if (lastEvent.type === 'stage_update' || lastEvent.type === 'coaches_mapped') {
      // Refresh list so status chips stay current without waiting for the 5s poll
      loadSessions();
    }
  }, [lastEvent, loadSessions]);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [stationFilter, setStationFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('');
  const [expandedRows, setExpandedRows] = useState({});

  // Unique station names present in loaded sessions — for the Station filter dropdown
  const stationOptions = [...new Set(sessions.map(s => s.stationName).filter(n => n && n !== '—'))].sort();

  // Wizard state management
  const [showAddWizard, setShowAddWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  
  // Wizard Step 1 inputs
  const [newTrainNumber, setNewTrainNumber] = useState('VB-22904');
  const [newDepot, setNewDepot] = useState('Mumbai Central CDO');
  const [newCoachesCount, setNewCoachesCount] = useState(16);
  const [ocrFile, setOcrFile] = useState(null);          // single OCR/placard camera video
  const [componentFiles, setComponentFiles] = useState([]); // one or more component camera videos
  const [autoDetect, setAutoDetect] = useState(true);
  const [framesPerSecond, setFramesPerSecond] = useState(1); // default until config loads

  // Load pipeline config defaults
  useEffect(() => {
    getConfig().then(cfg => {
      if (cfg?.pipeline?.frames_per_second) setFramesPerSecond(cfg.pipeline.frames_per_second);
    }).catch(() => {});
  }, []);

  // Wizard Step 2 pipeline simulation
  const [pipelineProgress, setPipelineProgress] = useState(0);
  const [pipelineLogs, setPipelineLogs] = useState([]);
  const [currentStage, setCurrentStage] = useState('INPUT'); // INPUT, DETECTION, REPORT
  
  // Wizard Step 3 output summary
  const [detectedDefects, setDetectedDefects] = useState([]);

  // Modal edit/delete state
  const [deletingSessionId, setDeletingSessionId] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [editingSession, setEditingSession] = useState(null);

  // Toggle row expansion
  const toggleRow = (id) => {
    setExpandedRows(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Filter sessions
  const filteredSessions = sessions.filter(session => {
    const matchesSearch = session.trainNumber.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          session.id.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'ALL' || session.status === statusFilter;
    const matchesSeverity = severityFilter === 'ALL' || session.severity === severityFilter;
    const matchesStation = stationFilter === 'ALL' || session.stationName === stationFilter;
    const matchesLocked = !lockedStation || session.stationName === lockedStation;
    const matchesDate = !dateFilter || (session.startedAt &&
      new Date(session.startedAt).toLocaleDateString('en-CA') === dateFilter);

    return matchesSearch && matchesStatus && matchesSeverity && matchesStation && matchesLocked && matchesDate;
  });


  // Handle Start Pipeline — upload videos; frame extractor calls /process when done
  const handleStartPipeline = async () => {
    if (!ocrFile) { setUploadError('Please select a coach number / placard camera video.'); return; }
    if (componentFiles.length === 0) { setUploadError('Please add at least one component / assembly camera video.'); return; }
    setUploadError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      if (!autoDetect) fd.append('train_number', newTrainNumber);
      fd.append('frames_per_second', String(framesPerSecond));
      fd.append('ocr_video', ocrFile, ocrFile.name);
      for (const f of componentFiles) fd.append('component_video', f, f.name);
      await uploadSession(fd);
      await loadSessions();
      setShowAddWizard(false);
      setWizardStep(1);
      setOcrFile(null);
      setComponentFiles([]);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  };

  // Handle Delete — optimistic removal, API in background
  const handleDeleteSession = async (id) => {
    setDeleteLoading(true);
    // Add to deletingIds set and remove from sessions immediately
    setDeletingIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setSessions(prev => prev.filter(s => s.id !== id));
    setDeletingSessionId(null);
    setDeleteLoading(false);
    toast.success('Session deletion initiated. Cleaning up server data…', 'Deleting');
    
    // Fire API in background
    try {
      await deleteSession(id);
      toast.success('Session permanently deleted.', 'Done');
      setDeletingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err) {
      toast.error(err.message || 'Server cleanup failed — refresh to re-sync.', 'Error');
      setDeletingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      loadSessions(); // re-sync if API failed
    }
  };

  // Handle Edit Save — optimistic local update only (no server-side edit endpoint yet)
  const handleSaveEdit = (e) => {
    e.preventDefault();
    setSessions(prev => prev.map(s =>
      s.id === editingSession.id
        ? { ...s, trainNumber: editingSession.trainNumber, coachesCount: Number(editingSession.coachesCount), status: editingSession.status }
        : s
    ));
    setEditingSession(null);
  };

  const getStatusBadge = (status, progressPercent = 0) => {
    let dotColor = 'bg-slate-300';
    let dotShadow = '';
    let dotAnimation = '';
    let text = status;

    switch (status) {
      case 'SYNCHRONIZING':
        dotColor = 'bg-blue-500';
        dotShadow = 'shadow-[0_0_6px_rgba(59,130,246,0.4)]';
        dotAnimation = 'animate-spin text-blue-500';
        text = `Sync (${progressPercent}%)`;
        break;
      case 'PROCESSING':
        dotColor = 'bg-cyan-500';
        dotShadow = 'shadow-[0_0_6px_rgba(6,182,212,0.4)]';
        dotAnimation = 'animate-pulse';
        text = `Processing (${progressPercent}%)`;
        break;
      case 'COMPLETED':
        dotColor = 'bg-emerald-500';
        dotShadow = 'shadow-[0_0_6px_rgba(16,185,129,0.4)]';
        text = 'Completed';
        break;
      case 'FAILED':
        dotColor = 'bg-red-500';
        dotShadow = 'shadow-[0_0_6px_rgba(239,68,68,0.4)]';
        text = 'Failed';
        break;
      default:
        break;
    }

    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-white text-slate-800 border border-slate-200 shadow-sm transition-all hover:border-slate-300">
        {status === 'SYNCHRONIZING' ? (
          <RefreshCw className="w-3 h-3 animate-spin text-blue-500" />
        ) : (
          <span className={`w-1.5 h-1.5 rounded-full ${dotColor} ${dotShadow} ${dotAnimation}`} />
        )}
        <span>{text}</span>
      </span>
    );
  };

  const getSeverityBadge = (severity, defectsText) => {
    let dotColor = 'bg-slate-300';
    let dotShadow = '';
    let textColor = 'text-slate-600';
    let bg = 'bg-slate-50';

    switch (severity) {
      case 'CRITICAL':
        dotColor = 'bg-red-500';
        dotShadow = 'shadow-[0_0_6px_rgba(239,68,68,0.4)]';
        textColor = 'text-slate-800';
        bg = 'bg-white';
        break;
      case 'REVIEW':
        dotColor = 'bg-amber-500';
        dotShadow = 'shadow-[0_0_6px_rgba(245,158,11,0.4)]';
        textColor = 'text-slate-800';
        bg = 'bg-white';
        break;
      default:
        break;
    }

    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-slate-200 ${bg} ${textColor} shadow-sm`}>
        {severity !== 'NONE' && (
          <span className={`w-1.5 h-1.5 rounded-full ${dotColor} ${dotShadow}`} />
        )}
        <span>{severity === 'NONE' ? 'None' : defectsText}</span>
      </span>
    );
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">INSPECTION SESSIONS</h1>
          <p className="text-sm text-muted-foreground mt-1">Monitor, review, replay, and manage train inspection sessions.</p>
        </div>
        <button
          onClick={() => {
            setShowAddWizard(true);
            setWizardStep(1);
            setOcrFile(null);
            setComponentFiles([]);
            setUploadError(null);
          }}
          className="bg-primary hover:bg-slate-800 text-primary-foreground px-4 py-2 rounded text-xs font-bold tracking-wider uppercase transition-colors shadow-sm flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Add Inspection
        </button>
      </div>

      {/* NEW INSPECTION DIALOG */}
      {showAddWizard && (
        <Card className="border-2 border-primary bg-slate-50/50 shadow-md">
          <CardHeader className="border-b border-border pb-4 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                <Train className="w-4 h-4 text-primary" /> Create New AI Inspection Session
              </CardTitle>
              <CardDescription className="text-xs">Setup train targets, select multi-camera feeds, and launch background AI pipeline inference.</CardDescription>
            </div>
            <button
              onClick={() => { setShowAddWizard(false); setOcrFile(null); setComponentFiles([]); setUploadError(null); }}
              className="text-slate-400 hover:text-slate-655 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </CardHeader>
          
          <CardContent className="pt-6">
            <div className="space-y-6 max-w-2xl mx-auto">
              {/* Auto-detect Metadata Checkbox */}
              <div className="flex items-center justify-between p-3.5 bg-slate-100/80 rounded border border-border transition-all">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="auto-detect-checkbox"
                    checked={autoDetect}
                    onChange={(e) => setAutoDetect(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                  />
                  <label htmlFor="auto-detect-checkbox" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
                    Auto-detect Train ID & Coaches Count from Video Feed
                  </label>
                </div>
                <Badge className="bg-primary/10 text-primary border border-primary/20 text-[9px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded">
                  AI Coach Number & Sensor Sync
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700">Train Number / Identifier</label>
                  <input
                    type="text"
                    value={autoDetect ? 'Auto-detecting coach number...' : newTrainNumber}
                    disabled={autoDetect}
                    onChange={(e) => setNewTrainNumber(e.target.value)}
                    className={`w-full px-3 py-2 border border-border text-xs font-semibold rounded focus:outline-none focus:border-primary transition-colors ${autoDetect ? 'bg-slate-100 text-slate-400 cursor-not-allowed select-none' : 'bg-white text-slate-800'}`}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700">Coaches Count</label>
                  <input
                    type="text"
                    value={autoDetect ? 'Auto-detecting via sensors...' : newCoachesCount}
                    disabled={autoDetect}
                    onChange={(e) => setNewCoachesCount(Number(e.target.value))}
                    className={`w-full px-3 py-2 border border-border text-xs font-semibold rounded focus:outline-none focus:border-primary transition-colors ${autoDetect ? 'bg-slate-100 text-slate-400 cursor-not-allowed select-none' : 'bg-white text-slate-800'}`}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700">Assigned Depot / CDO</label>
                <select
                  value={newDepot}
                  onChange={(e) => setNewDepot(e.target.value)}
                  className="w-full px-3 py-2 border border-border bg-white text-xs font-semibold rounded focus:outline-none focus:border-primary"
                >
                  <option value="Mumbai Central CDO">Mumbai Central CDO</option>
                  <option value="New Delhi CDO">New Delhi CDO</option>
                  <option value="Kolkata CDO">Kolkata CDO</option>
                </select>
              </div>

              {/* Frame Rate Selector */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                  Frames per Second to Extract
                </label>
                <div className="flex gap-2">
                  {[0.5, 1, 2, 5].map(fps => (
                    <button
                      key={fps}
                      type="button"
                      onClick={() => setFramesPerSecond(fps)}
                      className={`flex-1 py-1.5 text-xs font-bold rounded border transition-all cursor-pointer ${
                        framesPerSecond === fps
                          ? 'bg-primary text-white border-primary'
                          : 'bg-white text-slate-600 border-border hover:border-primary hover:text-primary'
                      }`}
                    >
                      {fps} fps
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5 font-semibold">
                  {framesPerSecond <= 1
                    ? `Testing mode — ~${framesPerSecond} frame/s keeps processing fast`
                    : `Production mode — ${framesPerSecond} frames/s for better detection`
                  }
                  {' · '}Default set in <code className="font-mono bg-slate-100 px-1 rounded">config.json</code>
                </p>
              </div>

              {/* Camera Upload Zones */}
              <div className="space-y-3">
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Camera Feeds
                </label>

                {/* Zone A — OCR / Placard Camera (exactly 1, required) */}
                <div className="border border-border rounded-lg p-4 bg-white space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black text-slate-800">Coach Number / Placard Camera</p>
                      <p className="text-[10px] text-muted-foreground font-semibold">
                        The camera that films the coach number placard — 1 video, required
                      </p>
                    </div>
                    <Badge className={`text-[9px] font-black border ${ocrFile ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                      {ocrFile ? 'Ready' : 'Required'}
                    </Badge>
                  </div>
                  <input type="file" className="hidden" id="ocr-file-input" accept="video/*,.mp4,.h264,.avi,.mov"
                    onChange={(e) => setOcrFile(e.target.files[0] || null)} />
                  {ocrFile ? (
                    <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-border rounded">
                      <div className="flex items-center gap-2 text-left">
                        <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-slate-800 truncate max-w-[240px]">{ocrFile.name}</p>
                          <p className="text-[10px] text-muted-foreground">{(ocrFile.size / (1024 * 1024)).toFixed(1)} MB</p>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <button type="button" onClick={() => document.getElementById('ocr-file-input').click()}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded border border-border cursor-pointer">
                          Change
                        </button>
                        <button type="button" onClick={() => setOcrFile(null)}
                          className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-bold rounded border border-red-200 cursor-pointer">
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => document.getElementById('ocr-file-input').click()}
                      className="w-full py-3 border-2 border-dashed border-border rounded text-xs font-bold text-slate-500 hover:border-primary hover:text-primary transition-all flex items-center justify-center gap-2 cursor-pointer">
                      <Upload className="w-4 h-4" /> Select coach number camera video
                    </button>
                  )}
                </div>

                {/* Zone B — Component / Assembly Cameras (1–6, at least 1 required) */}
                <div className="border border-border rounded-lg p-4 bg-white space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black text-slate-800">Assembly / Component Cameras</p>
                      <p className="text-[10px] text-muted-foreground font-semibold">
                        Left rail, right rail, bottom, etc. — 1 to 6 videos, at least 1 required
                      </p>
                    </div>
                    <Badge className={`text-[9px] font-black border ${componentFiles.length > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                      {componentFiles.length > 0 ? `${componentFiles.length} added` : 'Required'}
                    </Badge>
                  </div>
                  <input type="file" className="hidden" id="component-file-input" accept="video/*,.mp4,.h264,.avi,.mov" multiple
                    onChange={(e) => {
                      const picked = Array.from(e.target.files || []);
                      setComponentFiles(prev => {
                        const merged = [...prev, ...picked];
                        return merged.slice(0, 6); // cap at 6
                      });
                      e.target.value = ''; // allow re-selecting same file
                    }} />
                  {componentFiles.length > 0 && (
                    <div className="space-y-1.5">
                      {componentFiles.map((f, i) => (
                        <div key={i} className="flex items-center justify-between p-2.5 bg-slate-50 border border-border rounded">
                          <div className="flex items-center gap-2 text-left">
                            <FileText className="w-4 h-4 text-primary shrink-0" />
                            <div>
                              <p className="text-xs font-bold text-slate-800 truncate max-w-[200px]">{f.name}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {['component_left', 'component_right', 'bottom', 'suspension', 'wheel', 'overview'][i] ?? `component_${i + 1}`}
                                {' · '}{(f.size / (1024 * 1024)).toFixed(1)} MB
                              </p>
                            </div>
                          </div>
                          <button type="button"
                            onClick={() => setComponentFiles(prev => prev.filter((_, idx) => idx !== i))}
                            className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {componentFiles.length < 6 && (
                    <button type="button" onClick={() => document.getElementById('component-file-input').click()}
                      className="w-full py-3 border-2 border-dashed border-border rounded text-xs font-bold text-slate-500 hover:border-primary hover:text-primary transition-all flex items-center justify-center gap-2 cursor-pointer">
                      <Upload className="w-4 h-4" />
                      {componentFiles.length === 0 ? 'Select component camera videos' : 'Add another camera'}
                    </button>
                  )}
                </div>
              </div>

              {uploadError && (
                <p className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  Upload failed: {uploadError}
                </p>
              )}

              <div className="flex justify-end pt-4 border-t border-border gap-2">
                <button
                  type="button"
                  onClick={() => { setShowAddWizard(false); setOcrFile(null); setComponentFiles([]); setUploadError(null); }}
                  className="px-3 py-1.5 border border-border bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold uppercase rounded cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleStartPipeline}
                  disabled={uploading || !ocrFile || componentFiles.length === 0}
                  className="bg-primary hover:bg-slate-800 text-white text-xs font-bold uppercase px-4 py-2 rounded shadow transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {uploading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  {uploading ? 'Uploading...' : `Start Pipeline (${1 + componentFiles.length} cameras)`}
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters Bar */}
      <div className="bg-card border border-border p-4 rounded shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Search bar */}
          <div className="relative flex-1 min-w-[280px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by Train ID or Session ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 w-full rounded border border-border bg-slate-50 text-sm focus:outline-none focus:border-primary focus:bg-white transition-all"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')} 
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status selector */}
            <div className="flex items-center bg-slate-50 border border-border rounded p-1 text-xs font-bold">
              <span className="px-2 text-muted-foreground">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-transparent border-none focus:ring-0 cursor-pointer font-bold text-primary"
              >
                <option value="ALL">All States</option>
                <option value="SYNCHRONIZING">Synchronizing</option>
                <option value="PROCESSING">Processing</option>
                <option value="COMPLETED">Completed</option>
                <option value="FAILED">Failed</option>
              </select>
            </div>

            {/* Severity filter */}
            <div className="flex items-center bg-slate-50 border border-border rounded p-1 text-xs font-bold">
              <span className="px-2 text-muted-foreground">Severity:</span>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="bg-transparent border-none focus:ring-0 cursor-pointer font-bold text-primary"
              >
                <option value="ALL">All Severities</option>
                <option value="CRITICAL">Critical</option>
                <option value="REVIEW">Review</option>
                <option value="NONE">None</option>
              </select>
            </div>

            {/* Station filter — hidden when locked to a station via the workspace */}
            {!embedded && (
              <div className="flex items-center bg-slate-50 border border-border rounded p-1 text-xs font-bold">
                <span className="px-2 text-muted-foreground">Station:</span>
                <select
                  value={stationFilter}
                  onChange={(e) => setStationFilter(e.target.value)}
                  className="bg-transparent border-none focus:ring-0 cursor-pointer font-bold text-primary"
                >
                  <option value="ALL">All Stations</option>
                  {stationOptions.map(st => <option key={st} value={st}>{st}</option>)}
                </select>
              </div>
            )}

            {/* Date filter */}
            <div className="flex items-center bg-slate-50 border border-border rounded p-1 text-xs font-bold">
              <span className="px-2 text-muted-foreground">Date:</span>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="bg-transparent border-none focus:ring-0 cursor-pointer font-bold text-primary"
              />
              {dateFilter && (
                <button onClick={() => setDateFilter('')} className="px-1.5 text-muted-foreground hover:text-foreground" title="Clear date">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sessions Data Table */}
      <div className="bg-card border border-border rounded shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-border text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <th className="p-4 w-10"></th>
                <th className="p-4">Train ID</th>
                <th className="p-4">Station</th>
                <th className="p-4">Session ID</th>
                <th className="p-4">Start Time</th>
                <th className="p-4">Processing Status</th>
                <th className="p-4">Coaches</th>
                <th className="p-4">Defects</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm">
              {filteredSessions.length === 0 ? (
                <tr>
                  <td colSpan="9" className="p-8 text-center text-muted-foreground font-medium">
                    No sessions match the selected search and filter criteria.
                  </td>
                </tr>
              ) : (
                filteredSessions.map((session) => (
                  <React.Fragment key={session.id}>
                    {/* Primary Row */}
                    <tr 
                      className={`hover:bg-slate-50/50 transition-colors cursor-pointer ${expandedRows[session.id] ? 'bg-slate-50/30' : ''}`}
                      onClick={() => toggleRow(session.id)}
                    >
                      <td className="p-4 text-center">
                        {expandedRows[session.id] ? (
                          <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                      </td>
                      <td className="p-4 font-mono text-xs font-bold text-primary">
                        {session.trainNumber === 'VB-[DETECTING...]' ? (
                          <span className="text-[10px] text-cyan-600 font-extrabold uppercase animate-pulse">Detecting...</span>
                        ) : (
                          session.trainNumber
                        )}
                      </td>
                      <td className="p-4 text-xs font-semibold text-slate-600">{session.stationName || '—'}</td>
                      <td className="p-4 font-mono text-xs text-muted-foreground">{session.id}</td>
                      <td className="p-4 text-xs font-medium text-slate-600">
                        {new Date(session.startedAt).toLocaleString()}
                      </td>
                      <td className="p-4">{getStatusBadge(session.status, session.progressPercent)}</td>
                      <td className="p-4 font-mono text-xs font-bold text-slate-700">
                        {session.coachesCount === 0 ? (
                          <span className="text-[10px] text-cyan-600 font-extrabold uppercase animate-pulse">Detecting...</span>
                        ) : (
                          session.coachesCount
                        )}
                      </td>
                      <td className="p-4">{getSeverityBadge(session.severity, session.defectsText)}</td>
                      <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => navigate(`/train/${session.id}`)}
                            className="p-1.5 rounded hover:bg-slate-100 text-primary transition-colors"
                            title="Open Workspace"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => setEditingSession(session)}
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
                            title="Edit Train Info"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => setDeletingSessionId(session.id)}
                            className="p-1.5 rounded hover:bg-slate-100 text-red-500 hover:text-red-700 transition-colors"
                            title="Delete Session"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expandable Details Row */}
                    {expandedRows[session.id] && (
                      <tr className="bg-slate-50/20">
                        <td className="p-0" colSpan="9">
                          {session.status === 'PROCESSING' || session.status === 'SYNCHRONIZING' ? (
                            <div className="px-12 py-6 border-l-4 border-cyan-500 bg-slate-50/50 m-4 mt-0 rounded space-y-6">
                              {/* Header & Overall Progress */}
                              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div>
                                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 bg-cyan-500 rounded-full animate-ping" />
                                    Active Background Ingestion Pipeline
                                  </h4>
                                  <p className="text-[11px] text-slate-500 font-medium mt-1 font-mono uppercase">
                                    Step: {session.currentStep || 'Initializing...'}
                                  </p>
                                </div>
                                <div className="w-full md:w-64 space-y-1">
                                  <div className="flex justify-between text-[10px] font-bold text-slate-600">
                                    <span>Pipeline Progress</span>
                                    <span>{session.progressPercent || 0}%</span>
                                  </div>
                                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                                    <div 
                                      className="bg-cyan-50 h-full rounded-full transition-all duration-300" 
                                      style={{ width: `${session.progressPercent || 0}%` }}
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Stage badges */}
                              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[9px] font-black uppercase text-center text-slate-500 font-sans tracking-wider">
                                <div className={`p-2 border rounded-md flex items-center justify-center gap-1.5 ${(session.stages?.extraction === 'COMPLETED' || (session.progressPercent || 0) >= 20) ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : (session.progressPercent || 0) >= 0 ? 'bg-cyan-55 border-cyan-200 text-cyan-700 animate-pulse' : 'bg-white border-border'}`}>
                                  <span>{((session.progressPercent || 0) >= 25) ? '✓' : '~'}</span> Frame Extract
                                </div>
                                <div className={`p-2 border rounded-md flex items-center justify-center gap-1.5 ${(session.stages?.ocr === 'COMPLETED' || (session.progressPercent || 0) >= 45) ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : (session.progressPercent || 0) >= 25 ? 'bg-cyan-55 border-cyan-200 text-cyan-700 animate-pulse' : 'bg-white border-border'}`}>
                                  <span>{((session.progressPercent || 0) >= 50) ? '✓' : '•'}</span> Coach # Placard
                                </div>
                                <div className={`p-2 border rounded-md flex items-center justify-center gap-1.5 ${(session.stages?.sync === 'COMPLETED' || (session.progressPercent || 0) >= 65) ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : (session.progressPercent || 0) >= 50 ? 'bg-cyan-55 border-cyan-200 text-cyan-700 animate-pulse' : 'bg-white border-border'}`}>
                                  <span>{((session.progressPercent || 0) >= 70) ? '✓' : '•'}</span> Sync Cameras
                                </div>
                                <div className={`p-2 border rounded-md flex items-center justify-center gap-1.5 ${(session.stages?.component === 'COMPLETED' || (session.progressPercent || 0) >= 85) ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : (session.progressPercent || 0) >= 70 ? 'bg-cyan-55 border-cyan-200 text-cyan-700 animate-pulse' : 'bg-white border-border'}`}>
                                  <span>{((session.progressPercent || 0) >= 90) ? '✓' : '•'}</span> Custom Model Assembly
                                </div>
                                <div className={`p-2 border rounded-md flex items-center justify-center gap-1.5 ${(session.stages?.defect === 'COMPLETED' || (session.progressPercent || 0) >= 99) ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : (session.progressPercent || 0) >= 90 ? 'bg-cyan-55 border-cyan-200 text-cyan-700 animate-pulse' : 'bg-white border-border'}`}>
                                  <span>{((session.progressPercent || 0) >= 100) ? '✓' : '•'}</span> Defect Analysis
                                </div>
                              </div>

                              {/* Terminal Logs */}
                              <div className="space-y-1.5">
                                <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider flex items-center gap-1">
                                  <Terminal className="w-3.5 h-3.5" /> Background Inference Terminal Stream
                                </span>
                                <div className="bg-slate-950 border border-slate-900 rounded p-4 shadow-inner text-[10px] font-mono text-cyan-400 space-y-1.5 h-32 overflow-y-auto leading-relaxed">
                                  {session.logs && session.logs.map((log, index) => (
                                    <div key={index} className="flex gap-2">
                                      <span className="text-slate-500 font-bold">▶</span>
                                      <span>{log}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Actions */}
                              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                                <button
                                  onClick={() => navigate(`/train/${session.id}`)}
                                  className="px-3 py-1.5 bg-primary hover:bg-slate-800 text-primary-foreground text-[10px] font-extrabold uppercase rounded tracking-wider shadow-sm transition-all cursor-pointer"
                                >
                                  Open Live Pipeline Workspace
                                </button>
                              </div>
                            </div>
                          ) : (
                            // Completed / Failed View
                            <div className="px-12 py-4 border-l-4 border-primary bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-6 m-4 mt-0 rounded">
                              <div className="space-y-1">
                                <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">
                                  Mapped Infrastructure
                                </span>
                                <div className="text-sm font-semibold flex items-center gap-1.5">
                                  <CheckCircle2 className="w-4 h-4 text-blue-600" />
                                  {session.mappedCoaches || session.coachesCount} Coaches Mapped successfully
                                </div>
                              </div>

                              <div className="space-y-1">
                                <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">
                                  Sync Health
                                </span>
                                <div className="text-sm font-semibold flex items-center gap-1.5">
                                  <Activity className="w-4 h-4 text-primary" />
                                  {((session.syncHealth || 0.98) * 100).toFixed(1)}% (
                                  {(session.syncHealth || 0.98) > 0.95 ? 'High Stability' : 'Review Required'}
                                  )
                                </div>
                              </div>

                              <div className="space-y-1">
                                <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">
                                  AI ML Accuracy
                                </span>
                                <div className="text-sm font-semibold flex items-center gap-1.5">
                                  <Sparkles className="w-4 h-4 text-cyan-600" />
                                  {((session.mlAccuracy || 0.94) * 100).toFixed(1)}% Precision Anchor
                                </div>
                              </div>

                              <div>
                                <button 
                                  onClick={() => navigate(`/train/${session.id}`)}
                                  className="px-3 py-1.5 bg-primary hover:bg-slate-800 text-primary-foreground text-xs font-bold uppercase rounded tracking-wider shadow-sm transition-all"
                                >
                                  View Live Pipeline Workspace
                                </button>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer/Pagination */}
        <div className="p-4 flex items-center justify-between bg-slate-50/50 border-t border-border">
          <div className="text-xs text-muted-foreground font-bold">
            Showing {filteredSessions.length} of {sessions.length} sessions
          </div>
          <div className="flex gap-1">
            <button className="px-2.5 py-1.5 border border-border bg-white rounded text-xs font-bold hover:bg-slate-50 disabled:opacity-50" disabled>
              Prev
            </button>
            <button className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs font-bold">
              1
            </button>
            <button className="px-2.5 py-1.5 border border-border bg-white rounded text-xs font-bold hover:bg-slate-50 disabled:opacity-50" disabled>
              Next
            </button>
          </div>
        </div>
      </div>

      {/* CONFIRM DELETE MODAL */}
      {deletingSessionId && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-lg shadow-lg max-w-sm w-full p-6 space-y-4">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600 animate-pulse" /> Confirm Session Deletion
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to permanently delete session <span className="font-mono font-bold text-slate-700">{deletingSessionId}</span>? This action is irreversible.
            </p>
            <div className="flex justify-end gap-2 text-xs font-bold uppercase pt-2">
              <button
                onClick={() => setDeletingSessionId(null)}
                disabled={deleteLoading}
                className="px-3 py-2 border border-border bg-white text-slate-700 hover:bg-slate-50 rounded disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteSession(deletingSessionId)}
                disabled={deleteLoading}
                className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded flex items-center gap-1.5 disabled:opacity-75"
              >
                {deleteLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                {deleteLoading ? 'Deleting…' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT SESSION MODAL */}
      {editingSession && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveEdit} className="bg-card border border-border rounded-lg shadow-lg max-w-md w-full p-6 space-y-4">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-primary" /> Edit Session Information
            </h3>
            
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Train Identifier</label>
                <input
                  type="text"
                  value={editingSession.trainNumber}
                  onChange={(e) => setEditingSession({ ...editingSession, trainNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-border bg-white text-xs font-semibold rounded focus:outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Coaches Count</label>
                <input
                  type="number"
                  value={editingSession.coachesCount}
                  onChange={(e) => setEditingSession({ ...editingSession, coachesCount: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-border bg-white text-xs font-semibold rounded focus:outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Processing Status</label>
                <select
                  value={editingSession.status}
                  onChange={(e) => setEditingSession({ ...editingSession, status: e.target.value })}
                  className="w-full px-3 py-2 border border-border bg-white text-xs font-semibold rounded focus:outline-none focus:border-primary"
                >
                  <option value="SYNCHRONIZING">Synchronizing</option>
                  <option value="PROCESSING">Processing</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="FAILED">Failed</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 text-xs font-bold uppercase pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setEditingSession(null)}
                className="px-3 py-2 border border-border bg-white text-slate-700 hover:bg-slate-50 rounded"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-2 bg-primary hover:bg-slate-800 text-white rounded"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
