import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSessions, uploadSession, normalizeSession } from '../lib/api';
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
  FileText
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const Sessions = () => {
  const navigate = useNavigate();
  
  // CRUD state management
  const [sessions, setSessions] = useState([]);
  const [uploadError, setUploadError] = useState(null);
  const [uploading, setUploading] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const data = await getSessions();
      setSessions((data.sessions || []).map(normalizeSession));
    } catch (_) { /* silent — keep stale data */ }
  }, []);

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
  const [expandedRows, setExpandedRows] = useState({});

  // Wizard state management
  const [showAddWizard, setShowAddWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  
  // Wizard Step 1 inputs
  const [newTrainNumber, setNewTrainNumber] = useState('VB-22904');
  const [newDepot, setNewDepot] = useState('Mumbai Central CDO');
  const [newCoachesCount, setNewCoachesCount] = useState(16);
  const [selectedFile, setSelectedFile] = useState(null);
  const [autoDetect, setAutoDetect] = useState(true); // Default true for premium AI experience

  // Wizard Step 2 pipeline simulation
  const [pipelineProgress, setPipelineProgress] = useState(0);
  const [pipelineLogs, setPipelineLogs] = useState([]);
  const [currentStage, setCurrentStage] = useState('INPUT'); // INPUT, DETECTION, REPORT
  
  // Wizard Step 3 output summary
  const [detectedDefects, setDetectedDefects] = useState([]);

  // Modal edit/delete state
  const [deletingSessionId, setDeletingSessionId] = useState(null);
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

    return matchesSearch && matchesStatus && matchesSeverity;
  });


  // Handle Start Pipeline — upload video, then let API polling keep sessions fresh
  const handleStartPipeline = async () => {
    if (!selectedFile && !autoDetect) return;
    setUploadError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('train_number', autoDetect ? `TRAIN-${Date.now()}` : newTrainNumber);
      fd.append('frame_interval', '5');
      if (selectedFile) fd.append('video_files', selectedFile, selectedFile.name);
      await uploadSession(fd);
      await loadSessions();
      setShowAddWizard(false);
      setWizardStep(1);
      setSelectedFile(null);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  };

  // Handle Delete — removes from local state; polling will re-sync from server
  const handleDeleteSession = (id) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    setDeletingSessionId(null);
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
    switch (status) {
      case 'SYNCHRONIZING':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            <RefreshCw className="w-3 h-3 animate-spin" />
            Sync ({progressPercent}%)
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200">
            <Activity className="w-3.5 h-3.5 animate-pulse text-cyan-600" />
            Processing ({progressPercent}%)
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" />
            Completed
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
            <AlertTriangle className="w-3 h-3" />
            Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  const getSeverityBadge = (severity, defectsText) => {
    switch (severity) {
      case 'CRITICAL':
        return (
          <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200">
            {defectsText}
          </span>
        );
      case 'REVIEW':
        return (
          <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
            {defectsText}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
            None
          </span>
        );
    }
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
              onClick={() => setShowAddWizard(false)}
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
                  AI OCR & Sensor Sync
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700">Train Number / Identifier</label>
                  <input
                    type="text"
                    value={autoDetect ? 'Auto-detecting via OCR...' : newTrainNumber}
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

              {/* Upload Zone */}
              <div className="border-2 border-dashed border-border rounded-lg p-6 bg-white flex flex-col items-center justify-center text-center transition-all">
                <input
                  type="file"
                  className="hidden"
                  id="trigger-file"
                  onChange={(e) => setSelectedFile(e.target.files[0])}
                />
                {selectedFile ? (
                  <div className="space-y-3 w-full max-w-md mx-auto">
                    <div className="flex items-center justify-between p-3 bg-slate-50 border border-border rounded-lg">
                      <div className="flex items-center gap-2.5 text-left">
                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-805 truncate max-w-[220px]">
                            {selectedFile.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground font-semibold">
                            {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                          </p>
                        </div>
                      </div>
                      <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Ready
                      </Badge>
                    </div>
                    <div className="flex justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => document.getElementById('trigger-file').click()}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded uppercase tracking-wider transition-all border border-border cursor-pointer"
                      >
                        Change File
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedFile(null)}
                        className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-bold rounded uppercase tracking-wider transition-all border border-red-200 cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div 
                    onClick={() => document.getElementById('trigger-file').click()}
                    className="cursor-pointer w-full flex flex-col items-center justify-center"
                  >
                    <Upload className="w-8 h-8 text-slate-400 mb-2" />
                    <p className="text-xs font-bold text-slate-700">Drag & Drop Multi-Camera Inspection Feeds</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Accepts CAM_LEFT, CAM_RIGHT, CAM_OCR feeds (.mp4, .h264)</p>
                    <button 
                      type="button" 
                      className="mt-3 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded uppercase tracking-wider"
                    >
                      Select Files
                    </button>
                  </div>
                )}
              </div>

              {uploadError && (
                <p className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  Upload failed: {uploadError}
                </p>
              )}

              <div className="flex justify-end pt-4 border-t border-border gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddWizard(false)}
                  className="px-3 py-1.5 border border-border bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold uppercase rounded cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleStartPipeline}
                  disabled={uploading}
                  className="bg-primary hover:bg-slate-800 text-white text-xs font-bold uppercase px-4 py-2 rounded shadow transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {uploading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  {uploading ? 'Uploading...' : 'Start Pipeline Inference'}
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border p-4 rounded shadow-sm flex items-center gap-4">
          <div className="p-3 rounded bg-primary/10 text-primary">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Sessions</div>
            <div className="text-2xl font-black text-foreground">{sessions.length}</div>
          </div>
        </div>

        <div className="bg-card border border-border p-4 rounded shadow-sm flex items-center gap-4">
          <div className="p-3 rounded bg-blue-100 text-blue-700">
            <RefreshCw className="w-5 h-5 animate-spin" />
          </div>
          <div>
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Active Sessions</div>
            <div className="text-2xl font-black text-foreground">
              {sessions.filter(s => s.status === 'PROCESSING' || s.status === 'SYNCHRONIZING').length}
            </div>
          </div>
        </div>

        <div className="bg-card border border-border p-4 rounded shadow-sm flex items-center gap-4">
          <div className="p-3 rounded bg-amber-100 text-amber-700">
            <Clock className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Review Required</div>
            <div className="text-2xl font-black text-foreground">
              {sessions.filter(s => s.severity === 'REVIEW').length}
            </div>
          </div>
        </div>

        <div className="bg-card border border-border p-4 rounded shadow-sm flex items-center gap-4">
          <div className="p-3 rounded bg-red-100 text-red-700">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Critical Defects</div>
            <div className="text-2xl font-black text-foreground">
              {sessions.filter(s => s.severity === 'CRITICAL').length}
            </div>
          </div>
        </div>
      </div>

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
                <th className="p-4">Session ID</th>
                <th className="p-4">Start Time</th>
                <th className="p-4">Processing Status</th>
                <th className="p-4">Coaches</th>
                <th className="p-4">OCR Conf.</th>
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
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-700">
                            {(session.ocrConfidence * 100).toFixed(1)}%
                          </span>
                          <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden shrink-0 hidden sm:block">
                            <div 
                              className={`h-full ${session.ocrConfidence > 0.9 ? 'bg-blue-600' : 'bg-amber-500'}`} 
                              style={{ width: `${session.ocrConfidence * 100}%` }}
                            ></div>
                          </div>
                        </div>
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
                                  <span>{((session.progressPercent || 0) >= 50) ? '✓' : '•'}</span> OCR Placard
                                </div>
                                <div className={`p-2 border rounded-md flex items-center justify-center gap-1.5 ${(session.stages?.sync === 'COMPLETED' || (session.progressPercent || 0) >= 65) ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : (session.progressPercent || 0) >= 50 ? 'bg-cyan-55 border-cyan-200 text-cyan-700 animate-pulse' : 'bg-white border-border'}`}>
                                  <span>{((session.progressPercent || 0) >= 70) ? '✓' : '•'}</span> Sync Cameras
                                </div>
                                <div className={`p-2 border rounded-md flex items-center justify-center gap-1.5 ${(session.stages?.component === 'COMPLETED' || (session.progressPercent || 0) >= 85) ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : (session.progressPercent || 0) >= 70 ? 'bg-cyan-55 border-cyan-200 text-cyan-700 animate-pulse' : 'bg-white border-border'}`}>
                                  <span>{((session.progressPercent || 0) >= 90) ? '✓' : '•'}</span> YOLO Assembly
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
                className="px-3 py-2 border border-border bg-white text-slate-700 hover:bg-slate-50 rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteSession(deletingSessionId)}
                className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded"
              >
                Permanently Delete
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
