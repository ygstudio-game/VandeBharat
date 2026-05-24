import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePolling } from '../hooks/usePolling';
import { getSessions, getReport, generateReport, getHierarchy, getIntelligence, signReport, normalizeSession, getCoachFrames, getFrames } from '../lib/api';
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
  Maximize2,
  Cpu,
  ScanSearch,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Activity,
  Sparkles,
  Info,
  MoreVertical,
  SlidersHorizontal,
  ChevronLeft,
  LayoutGrid
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import DetectionLogTable from '../components/DetectionLogTable';

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
    totalFrames: s.totalFrames || 0,
    ocrConf: s.ocrConfidence || 0,
    syncStability: s.syncHealth || 0,
    healthScore: s.healthScore,
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
  const [activeCoach, setActiveCoach] = useState(null); // real coach object or label
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Real data from backend
  const [realCoaches, setRealCoaches] = useState([]);
  const [coachIntel, setCoachIntel] = useState(null); // intelligence response for active coach
  const [intelLoading, setIntelLoading] = useState(false);
  const [activeDefectIndex, setActiveDefectIndex] = useState(0);

  // Frame player states
  const [coachFrames, setCoachFrames] = useState([]);
  const [selectedFrame, setSelectedFrame] = useState(null);
  const [framesLoading, setFramesLoading] = useState(false);

  // Bounding box overlay & zoom states
  const [showOcrBoxes, setShowOcrBoxes] = useState(false);
  const [showDefectBoxes, setShowDefectBoxes] = useState(true);
  const [showComponentBoxes, setShowComponentBoxes] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [layoutMode, setLayoutMode] = useState('single');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Canvas and Image references
  const imgRef = useRef(null);
  const canvasRef = useRef(null);
  const fullscreenImgRef = useRef(null);
  const fullscreenCanvasRef = useRef(null);
  const pendingSeekFrameIndexRef = useRef(null);
  const isPlayingRef = useRef(isPlaying);
  const coachFramesRef = useRef(coachFrames);
  const selectedFrameRef = useRef(selectedFrame);
  const activeCoachRef = useRef(activeCoach);
  const realCoachesRef = useRef(realCoaches);

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { coachFramesRef.current = coachFrames; }, [coachFrames]);
  useEffect(() => { selectedFrameRef.current = selectedFrame; }, [selectedFrame]);
  useEffect(() => { activeCoachRef.current = activeCoach; }, [activeCoach]);
  useEffect(() => { realCoachesRef.current = realCoaches; }, [realCoaches]);

  // Operator review actions
  const [pendingReviews, setPendingReviews] = useState(0);
  const [showReviewCard, setShowReviewCard] = useState(false);

  // Dialog state
  const [signingReport, setSigningReport] = useState(null);
  const [pinInput, setPinInput] = useState('');
  const [isSigningLoading, setIsSigningLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(null); // report ID

  const handleDownload = async (report) => {
    if (!report) return;
    const reportId = typeof report === 'string' ? report : report.id;

    setIsDownloading(reportId);
    try {
      // Always generate or update report first to ensure it's generated
      await generateReport(reportId);

      // Poll GET /api/sessions/:id/report until the PDF is ready
      let attempts = 0;
      const maxAttempts = 30; // up to 60 seconds
      let pdfUrl = null;

      while (attempts < maxAttempts) {
        attempts++;
        // Wait 2 seconds
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const data = await getReport(reportId);
        if (data && data.report_ready && data.pdf_url) {
          pdfUrl = data.pdf_url;
          break;
        } else if (data && data.status === 'failed') {
          throw new Error("Report generation failed in the background: " + (data.message || 'unknown error'));
        }
      }

      if (pdfUrl) {
        const fullUrl = pdfUrl.startsWith('http') ? pdfUrl : `http://localhost:8001${pdfUrl}`;
        setReportOverrides(prev => ({ ...prev, [reportId]: { pdfUrl: fullUrl } }));
        window.open(fullUrl, '_blank');
      } else {
        alert('Timeout waiting for PDF report generation. Please try again or verify session completion.');
      }
    } catch (err) {
      console.error("PDF generation or retrieval failed:", err);
      alert('Failed to generate or fetch PDF Report: ' + (err.message || 'Server error'));
    } finally {
      setIsDownloading(null);
    }
  };

  const handleSign = async (e) => {
    e.preventDefault();
    if (!pinInput || pinInput !== '1234') {
      alert('Invalid Security Pin. Please enter the supervisor authorization PIN (1234).');
      return;
    }
    setIsSigningLoading(true);
    try {
      await signReport(signingReport.id, `Signed off via Reports dashboard`);
      setLocalStatusOverrides(prev => ({ ...prev, [signingReport.id]: 'APPROVED' }));
      if (selectedReport && selectedReport.id === signingReport.id) {
        setSelectedReport(prev => ({ ...prev, status: 'APPROVED' }));
      }
    } catch (err) {
      alert('Sign-off failed: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSigningLoading(false);
      setSigningReport(null);
      setPinInput('');
    }
  };

  // Fetch coaches when a report is selected
  useEffect(() => {
    if (!selectedReport) { 
      setRealCoaches([]); 
      setCoachIntel(null); 
      setCoachFrames([]);
      setSelectedFrame(null);
      setActiveCoach(null); 
      setIsPlaying(false);
      return; 
    }
    getHierarchy(selectedReport.id)
      .then(data => {
        const coaches = data?.coaches || [];
        setRealCoaches(coaches);
        if (coaches.length > 0) {
          const firstCoachLabel = coaches[0].coach_number || `B${coaches[0].coach_index + 1}`;
          setActiveCoach(firstCoachLabel);
        } else {
          // If no coaches exist, we should still fetch overall session frames!
          setFramesLoading(true);
          getFrames(selectedReport.id, 200)
            .then(framesData => {
              const fetchedFrames = framesData?.frames || [];
              setCoachFrames(fetchedFrames);
              if (fetchedFrames.length > 0) {
                setSelectedFrame(fetchedFrames[0]);
              }
            })
            .catch(err => console.error("Error loading overall frames:", err))
            .finally(() => setFramesLoading(false));
        }
      })
      .catch(() => setRealCoaches([]));
  }, [selectedReport?.id]);

  // Fetch intelligence and frames in parallel when active coach changes
  useEffect(() => {
    if (!selectedReport || !activeCoach || realCoaches.length === 0) return;
    const coachObj = realCoaches.find(c => (c.coach_number || `B${c.coach_index + 1}`) === activeCoach);
    if (!coachObj) return;
    setIntelLoading(true);
    setFramesLoading(true);
    setActiveDefectIndex(0);

    Promise.all([
      getIntelligence(selectedReport.id, coachObj.id),
      getCoachFrames(selectedReport.id, coachObj.id, 200)
    ]).then(([intelData, framesData]) => {
      setCoachIntel(intelData);
      const fetchedFrames = framesData?.frames || [];
      setCoachFrames(fetchedFrames);
      
      // Auto-select first defect frame, or first frame if none has defect, or target seek frame if available
      if (fetchedFrames.length > 0) {
        if (pendingSeekFrameIndexRef.current !== null) {
          const idx = Math.min(fetchedFrames.length - 1, Math.max(0, pendingSeekFrameIndexRef.current));
          setSelectedFrame(fetchedFrames[idx]);
          pendingSeekFrameIndexRef.current = null; // reset seek
        } else {
          const defectFrame = fetchedFrames.find(f => f.is_defect_flagged || f.defects?.length > 0);
          setSelectedFrame(defectFrame || fetchedFrames[0]);
        }
      } else {
        setSelectedFrame(null);
      }
    }).catch(err => {
      console.error("Error loading coach data:", err);
      setCoachIntel(null);
      setCoachFrames([]);
      setSelectedFrame(null);
    }).finally(() => {
      setIntelLoading(false);
      setFramesLoading(false);
    });
  }, [activeCoach, selectedReport?.id, realCoaches]);

  // Ultra-smooth single-interval continuous video playback loop
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      const frames = coachFramesRef.current;
      const selected = selectedFrameRef.current;
      const coaches = realCoachesRef.current;
      const coach = activeCoachRef.current;

      if (frames.length > 0 && selected) {
        const currentIdx = frames.findIndex(f => f.id === selected.id);
        if (currentIdx !== -1 && currentIdx < frames.length - 1) {
          // Advance frame in current coach
          setSelectedFrame(frames[currentIdx + 1]);
        } else {
          // Reached the end of current coach frames. Let's move to next coach!
          if (coaches.length > 0) {
            const activeIdx = coaches.findIndex(c => (c.coach_number || `B${c.coach_index + 1}`) === coach);
            if (activeIdx !== -1 && activeIdx < coaches.length - 1) {
              const nextCoach = coaches[activeIdx + 1];
              const nextCoachLabel = nextCoach.coach_number || `B${nextCoach.coach_index + 1}`;
              // Set pending index to 0 so the first frame gets selected immediately
              pendingSeekFrameIndexRef.current = 0;
              setActiveCoach(nextCoachLabel);
            } else {
              // Reached very end of train. Pause playback.
              setIsPlaying(false);
            }
          } else {
            // Reached end of single list playback
            setIsPlaying(false);
          }
        }
      }
    }, 200);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Arrow key frame navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore key events if focused on input/textarea
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      if (coachFrames.length === 0 || !selectedFrame) return;

      const currentIndex = coachFrames.findIndex((f) => f.id === selectedFrame.id);
      if (currentIndex === -1) return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % coachFrames.length;
        setSelectedFrame(coachFrames[nextIndex]);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = (currentIndex - 1 + coachFrames.length) % coachFrames.length;
        setSelectedFrame(coachFrames[prevIndex]);
      }

      if (e.key === 'Escape') {
        setIsFullscreen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [coachFrames, selectedFrame, isFullscreen]);

  // Derived Playhead calculations
  const activeCoachIdx = realCoaches.findIndex(c => (c.coach_number || `B${c.coach_index + 1}`) === activeCoach);
  const currentFrameIdx = selectedFrame && coachFrames.length > 0 ? coachFrames.findIndex(f => f.id === selectedFrame.id) : 0;
  
  const totalCoaches = realCoaches.length || 1;
  const coachFramesCount = coachFrames.length || 1;
  
  const coachContribution = (activeCoachIdx >= 0 ? activeCoachIdx : 0) / totalCoaches;
  const frameContribution = (currentFrameIdx >= 0 ? currentFrameIdx : 0) / coachFramesCount / totalCoaches;
  
  const playheadPercent = (coachContribution + frameContribution) * 100;

  // Format seconds to dynamic timer
  const formatTime = (secs) => {
    const h = Math.floor(secs / 3600).toString().padStart(2, '0');
    const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  // Derive dynamic total duration from the selected session's completed_at vs started_at
  const sessionObj = sessionsData?.sessions?.find(s => s.id === selectedReport?.id);
  const started = sessionObj?.started_at ? new Date(sessionObj.started_at) : null;
  const completed = sessionObj?.completed_at ? new Date(sessionObj.completed_at) : null;
  const durationSeconds = started && completed ? Math.max(1, Math.floor((completed - started) / 1000)) : 261; // fallback to 4m 21s
  const playbackTime = formatTime(Math.floor((playheadPercent / 100) * durationSeconds));

  // Jump to specific coach
  const jumpToCoach = (coachLabel) => {
    setActiveCoach(coachLabel);
  };

  // Seek timeline by clicking on the timeline track
  const handleTimelineClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

    if (realCoaches.length === 0) {
      if (coachFrames.length > 0) {
        const frameIdx = Math.min(coachFrames.length - 1, Math.max(0, Math.floor(clickPct * coachFrames.length)));
        setSelectedFrame(coachFrames[frameIdx]);
      }
      return;
    }

    const totalPos = clickPct * totalCoaches;
    const clickedCoachIdx = Math.min(totalCoaches - 1, Math.floor(totalPos));
    const clickedCoach = realCoaches[clickedCoachIdx];
    if (clickedCoach) {
      const clickedCoachLabel = clickedCoach.coach_number || `B${clickedCoach.coach_index + 1}`;
      const clickedFrameFraction = totalPos - clickedCoachIdx;
      
      // Target seeking frame index fraction
      const targetFrameIdx = Math.floor(clickedFrameFraction * (coachFrames.length > 0 ? coachFrames.length : 29));

      if (activeCoach === clickedCoachLabel) {
        if (coachFrames.length > 0) {
          const frameIdx = Math.min(coachFrames.length - 1, Math.max(0, targetFrameIdx));
          setSelectedFrame(coachFrames[frameIdx]);
        }
      } else {
        pendingSeekFrameIndexRef.current = targetFrameIdx;
        setActiveCoach(clickedCoachLabel);
      }
    }
  };

  // Canvas drawing callback
  const drawOverlay = useCallback(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas || !selectedFrame) return;

    canvas.width = img.offsetWidth;
    canvas.height = img.offsetHeight;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!showOcrBoxes && !showDefectBoxes && !showComponentBoxes) return;
    if (!img.naturalWidth) return;

    // Compute letterbox offsets for object-contain scaling
    const scaleX = img.offsetWidth / img.naturalWidth;
    const scaleY = img.offsetHeight / img.naturalHeight;
    const scale = Math.min(scaleX, scaleY);
    const offX = (img.offsetWidth - img.naturalWidth * scale) / 2;
    const offY = (img.offsetHeight - img.naturalHeight * scale) / 2;

    const drawBox = (bx, by, bw, bh, color, label) => {
      if (bx == null) return;
      const x = bx * scale + offX;
      const y = by * scale + offY;
      const w = bw * scale;
      const h = bh * scale;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = color.replace(')', ', 0.08)').replace('rgb', 'rgba');
      ctx.fillRect(x, y, w, h);
      if (label) {
        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = color;
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(x, y > 14 ? y - 14 : y, tw + 4, 13);
        ctx.fillStyle = color;
        ctx.fillText(label, x + 2, y > 14 ? y - 3 : y + 10);
      }
    };

    if (showOcrBoxes) {
      for (const r of selectedFrame.ocr_results || []) {
        const label = r.is_valid
          ? `Coach ${r.coach_number} (${Math.round(r.confidence * 100)}%)`
          : `? (${Math.round(r.confidence * 100)}%)`;
        drawBox(r.bbox_x, r.bbox_y, r.bbox_w, r.bbox_h, 'rgb(59,130,246)', label);
      }
    }

    if (showComponentBoxes) {
      const currentDetections = coachIntel?.components_detected?.filter(
        c => c.trigger_id === selectedFrame.trigger_id || c.frame_url === selectedFrame.cloudinary_url
      ) || [];
      for (const d of currentDetections) {
        const label = `${d.component_name ?? d.component_code} ${Math.round(d.confidence * 100)}%`;
        drawBox(d.bbox?.x, d.bbox?.y, d.bbox?.w, d.bbox?.h, 'rgb(163,230,53)', label);
      }
    }

    if (showDefectBoxes) {
      for (const d of selectedFrame.defects || []) {
        const color = d.severity === 'CRITICAL' ? 'rgb(239,68,68)' : 'rgb(245,158,11)';
        drawBox(d.bbox_x, d.bbox_y, d.bbox_w, d.bbox_h, color, d.defect_type);
      }
    }
  }, [showOcrBoxes, showDefectBoxes, showComponentBoxes, selectedFrame, coachIntel]);

  const drawFullscreenOverlay = useCallback(() => {
    const img    = fullscreenImgRef.current;
    const canvas = fullscreenCanvasRef.current;
    if (!img || !canvas || !isFullscreen || !selectedFrame) return;

    canvas.width  = img.offsetWidth;
    canvas.height = img.offsetHeight;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!showOcrBoxes && !showDefectBoxes && !showComponentBoxes) return;
    if (!img.naturalWidth) return;

    // Compute letterbox offsets for object-contain scaling
    const scaleX  = img.offsetWidth  / img.naturalWidth;
    const scaleY  = img.offsetHeight / img.naturalHeight;
    const scale   = Math.min(scaleX, scaleY);
    const offX    = (img.offsetWidth  - img.naturalWidth  * scale) / 2;
    const offY    = (img.offsetHeight - img.naturalHeight * scale) / 2;

    const drawBox = (bx, by, bw, bh, color, label) => {
      if (bx == null) return;
      const x = bx * scale + offX;
      const y = by * scale + offY;
      const w = bw * scale;
      const h = bh * scale;
      ctx.strokeStyle = color;
      ctx.lineWidth   = 2.5; // Slightly thicker for fullscreen view
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle   = color.replace(')', ', 0.12)').replace('rgb', 'rgba');
      ctx.fillRect(x, y, w, h);
      if (label) {
        ctx.font      = 'bold 12px monospace';
        ctx.fillStyle = color;
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(x, y > 15 ? y - 15 : y, tw + 4, 14);
        ctx.fillStyle = color;
        ctx.fillText(label, x + 2, y > 15 ? y - 3 : y + 11);
      }
    };

    if (showOcrBoxes) {
      for (const r of selectedFrame?.ocr_results || []) {
        const label = r.is_valid
          ? `Coach ${r.coach_number} (${Math.round(r.confidence * 100)}%)`
          : `? (${Math.round(r.confidence * 100)}%)`;
        drawBox(r.bbox_x, r.bbox_y, r.bbox_w, r.bbox_h, 'rgb(59,130,246)', label);
      }
    }

    if (showComponentBoxes) {
      const currentDetections = coachIntel?.components_detected?.filter(
        c => c.trigger_id === selectedFrame.trigger_id || c.frame_url === selectedFrame.cloudinary_url
      ) || [];
      for (const d of currentDetections) {
        const label = `${d.component_name ?? d.component_code} ${Math.round(d.confidence * 100)}%`;
        drawBox(d.bbox?.x, d.bbox?.y, d.bbox?.w, d.bbox?.h, 'rgb(163,230,53)', label);
      }
    }

    if (showDefectBoxes) {
      for (const d of selectedFrame?.defects || []) {
        const color = d.severity === 'CRITICAL' ? 'rgb(239,68,68)' : 'rgb(245,158,11)';
        drawBox(d.bbox_x, d.bbox_y, d.bbox_w, d.bbox_h, color, d.defect_type);
      }
    }
  }, [showOcrBoxes, showDefectBoxes, showComponentBoxes, selectedFrame, coachIntel, isFullscreen]);

  useEffect(() => {
    if (isFullscreen) {
      const timer = setTimeout(() => {
        drawFullscreenOverlay();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [drawFullscreenOverlay, isFullscreen, selectedFrame]);

  // Hook to redraw canvas
  useEffect(() => {
    const handleResize = () => {
      drawOverlay();
      if (isFullscreen) drawFullscreenOverlay();
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawOverlay, drawFullscreenOverlay, isFullscreen, selectedFrame]);

  const filteredReports = displayReports.filter(rep => {
    const matchesSearch = rep.trainNumber.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          rep.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || rep.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Derive coach labels for the sidebar + timeline
  const coachLabels = realCoaches.map(c => c.coach_number || `B${c.coach_index + 1}`);

  // Render detailed Report Generation Workspace
  if (selectedReport) {
    // Derive coachBreakdown from real intelligence data
    const defects = coachIntel?.defects || [];
    const components = coachIntel?.components_detected || [];
    const missing = coachIntel?.missing_components || [];
    const summary = coachIntel?.summary || {};
    const coachData = coachIntel?.coach || {};

    const healthScore = coachData.health_score ?? (defects.length === 0 ? 100 : Math.max(0, 100 - defects.length * 15));

    const coachBreakdown = {
      title: `Coach ${activeCoach || '—'} Breakdown`,
      healthScore: Math.round(healthScore),
      complianceScore: missing.length === 0 ? 100 : Math.max(0, 100 - missing.length * 10),
      stressScore: summary.critical > 0 ? 70 : summary.high > 0 ? 50 : 25,
      items: components.length > 0
        ? components.slice(0, 6).map(c => ({
            name: c.component_name || c.component_code,
            value: `${Math.round(c.confidence * 100)}% CONF`,
            isError: c.confidence < 0.5,
          }))
        : [
            { name: 'Components Detected', value: String(summary.components_detected ?? 0), isError: false },
            { name: 'Missing Components', value: String(summary.missing_components ?? 0), isError: (summary.missing_components ?? 0) > 0 },
            { name: 'Total Defects', value: String(summary.total_defects ?? 0), isError: (summary.total_defects ?? 0) > 0 },
          ],
    };

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
                  / SESSION: {selectedReport.id}
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
                <div className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> <span>{formatTime(durationSeconds)}</span></div>
                <div className="flex items-center gap-1"><Train className="w-3.5 h-3.5" /> <span>{selectedReport.totalCoaches} Coaches</span></div>
                <div className="flex items-center gap-1 text-red-600 font-extrabold"><AlertTriangle className="w-3.5 h-3.5" /> <span>{selectedReport.criticalDefects} Critical Defects</span></div>
              </div>
            </div>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={() => handleDownload(selectedReport)}
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
                <span>Train {selectedReport.trainNumber}</span>
              </div>
              
              {/* Nested Coaches */}
              <div className="ml-4 space-y-1 border-l-2 border-slate-200 pl-2">
                {coachLabels.length === 0 ? (
                  <div className="text-[10px] text-slate-400 p-2 italic">Loading coaches…</div>
                ) : coachLabels.map((label, idx) => {
                  const coachObj = realCoaches[idx];
                  const hasDefect = (coachObj?.critical_defects || 0) > 0;
                  return (
                  <div 
                    key={label}
                    onClick={() => jumpToCoach(label)}
                    className={`flex items-center justify-between p-2 rounded text-xs transition-colors cursor-pointer ${activeCoach === label ? 'bg-primary/10 font-bold text-primary border border-primary/20' : 'hover:bg-slate-100 text-slate-600'}`}
                  >
                    <div className="flex items-center gap-2">
                      {hasDefect ? (
                        <AlertTriangle className="w-4 h-4 text-red-600" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-slate-400" />
                      )}
                      <span>Coach {label}</span>
                    </div>
                    {hasDefect && (
                      <span className="bg-red-600 text-white text-[8px] font-bold px-1 py-0.25 rounded uppercase">
                        Defect
                      </span>
                    )}
                  </div>
                  );
                })}
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
                  <span className="text-lg font-black text-slate-800">{((selectedReport.syncStability || 0) * 100).toFixed(1)}%</span>
                </div>
                <Activity className="text-primary w-8 h-8 opacity-80" />
              </div>

              <div className="bg-white border border-slate-200 p-4 rounded shadow-sm flex justify-between items-center">
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase block">OCR Accuracy</span>
                  <span className="text-lg font-black text-slate-800">{((selectedReport.ocrConf || 0) * 100).toFixed(1)}%</span>
                </div>
                <Sparkles className="text-primary w-8 h-8 opacity-80" />
              </div>
            </div>
            {/* Real-time Interactive Frame Viewer & Canvas Overlay System */}
            <div className="bg-white border border-slate-200 rounded shadow-sm overflow-hidden flex flex-col">
              {/* Toolbar */}
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex flex-wrap justify-between items-center gap-4">
                {/* Overlay toggles */}
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black text-slate-500 uppercase mr-1">Overlays:</span>
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-slate-700 bg-white px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={showDefectBoxes}
                      onChange={(e) => setShowDefectBoxes(e.target.checked)}
                      className="rounded text-red-600 focus:ring-red-500"
                    />
                    <span className="flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 text-red-600" /> Defects</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-slate-700 bg-white px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={showComponentBoxes}
                      onChange={(e) => setShowComponentBoxes(e.target.checked)}
                      className="rounded text-lime-600 focus:ring-lime-500"
                    />
                    <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-lime-600" /> Components</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-slate-700 bg-white px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={showOcrBoxes}
                      onChange={(e) => setShowOcrBoxes(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5 text-blue-600" /> OCR</span>
                  </label>
                </div>
                {/* Zoom controls */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center bg-white border border-slate-200 rounded p-0.5 shadow-sm mr-2">
                    <button 
                      onClick={() => setLayoutMode('single')} 
                      className={`p-1.5 rounded transition-all ${layoutMode === 'single' ? 'bg-slate-100 text-slate-800' : 'text-slate-400'}`} 
                      title="Single frame"
                    >
                      <Maximize className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => setLayoutMode('grid')} 
                      className={`p-1.5 rounded transition-all ${layoutMode === 'grid' ? 'bg-slate-100 text-slate-800' : 'text-slate-400'}`} 
                      title="Frame grid"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {layoutMode === 'single' && (
                    <button 
                      onClick={() => setIsFullscreen(true)} 
                      className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded transition-all border border-slate-200 bg-white shadow-sm cursor-pointer mr-2 flex items-center justify-center" 
                      title="Toggle Fullscreen"
                    >
                      <Maximize2 className="w-3.5 h-3.5 text-slate-600" />
                    </button>
                  )}

                  <span className="text-xs font-bold text-slate-505 font-mono">{zoomLevel}%</span>
                  <button
                    onClick={() => setZoomLevel((prev) => Math.max(50, prev - 25))}
                    className="p-1 bg-white border border-slate-200 rounded text-slate-600 hover:bg-slate-100 font-black text-xs px-2"
                    title="Zoom Out"
                  >
                    -
                  </button>
                  <button
                    onClick={() => setZoomLevel(100)}
                    className="p-1 bg-white border border-slate-200 rounded text-xs text-slate-600 hover:bg-slate-100 px-2 font-bold"
                  >
                    1:1
                  </button>
                  <button
                    onClick={() => setZoomLevel((prev) => Math.min(200, prev + 25))}
                    className="p-1 bg-white border border-slate-200 rounded text-slate-600 hover:bg-slate-100 font-black text-xs px-2"
                    title="Zoom In"
                  >
                    +
                  </button>
                </div>
              </div>
              {/* Viewport & Canvas Overlay Container */}
              <div className="grid grid-cols-1 xl:grid-cols-4 h-[500px]">
                <div className="xl:col-span-3 bg-slate-900 rounded-l flex flex-col items-center justify-center relative h-full overflow-hidden shadow-inner border border-slate-950 p-6 group">
                  {framesLoading ? (
                    <div className="flex flex-col items-center gap-3 text-white">
                      <Loader2 className="w-8 h-8 animate-spin text-primary animate-pulse" />
                      <span className="text-xs font-bold tracking-wider font-mono">LOADING COACH FRAMES...</span>
                    </div>
                  ) : coachFrames.length === 0 ? (
                    <div className="text-slate-400 text-xs italic flex flex-col items-center gap-2">
                      <Train className="w-8 h-8 opacity-40 text-slate-300" />
                      No frames available for Coach {activeCoach || 'Overall Session'}.
                    </div>
                  ) : layoutMode === 'single' ? (
                    selectedFrame ? (
                      <div className="absolute inset-0 flex items-center justify-center p-4" style={{ transform: `scale(${zoomLevel / 100})`, transition: 'transform 0.15s ease-out' }}>
                        <div className="relative max-w-full max-h-full flex items-center justify-center">
                          <img
                            ref={imgRef}
                            src={selectedFrame.cloudinary_url}
                            onLoad={drawOverlay}
                            alt={`Frame Seq ${selectedFrame.sequence_number}`}
                            className="max-w-full max-h-full object-contain rounded border border-slate-800 shadow-2xl block mx-auto"
                          />
                          <canvas
                            ref={canvasRef}
                            className="absolute inset-0 pointer-events-none rounded"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="text-slate-400 text-xs italic">Select a frame to begin analysis.</div>
                    )
                  ) : (
                    <div className="w-full h-[460px] grid grid-cols-3 gap-2 p-4 overflow-y-auto" style={{ transform: `scale(${zoomLevel / 100})`, transition: 'transform 0.2s ease-out' }}>
                      {coachFrames.slice(0, 24).map((f) => (
                        <div 
                          key={f.id} 
                          onClick={() => { setSelectedFrame(f); setLayoutMode('single'); }} 
                          className={`relative bg-slate-950 border rounded overflow-hidden cursor-pointer hover:border-primary transition-all aspect-video ${selectedFrame?.id === f.id ? 'border-primary ring-2 ring-primary/30' : 'border-slate-800'}`}
                        >
                          <img src={f.cloudinary_url} alt="" className="w-full h-full object-cover opacity-80 hover:opacity-100 transition-opacity" />
                          <div className="absolute bottom-1 left-1 bg-slate-950/80 px-1.5 py-0.5 rounded font-mono text-[8px] text-slate-300">
                            #{f.sequence_number}
                          </div>
                          {(f.is_defect_flagged || f.defects?.length > 0) && (
                            <div className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                          )}
                          {f.ocr_results?.some(r => r.is_valid) && (
                            <div className="absolute top-1.5 left-1.5 w-2.5 h-2.5 rounded-full bg-blue-500" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Frame details badge at top left of viewport */}
                  {selectedFrame && layoutMode === 'single' && (
                    <div className="absolute top-4 left-4 bg-slate-900/90 backdrop-blur px-3 py-1.5 rounded border border-slate-800 text-[10px] font-mono text-white flex items-center gap-3 z-20">
                      <span className="font-extrabold text-primary">FRAME #{selectedFrame.sequence_number}</span>
                      <span className="text-slate-500">|</span>
                      <span>TRIGGER: {selectedFrame.trigger_id}</span>
                    </div>
                  )}
                </div>

                {/* AI / Defect / Frame Inspector Panel */}
                <div className="p-5 flex flex-col gap-4 bg-white border-l border-slate-200 h-full overflow-y-auto w-full">
                  {selectedFrame && selectedFrame.defects && selectedFrame.defects.length > 0 ? (
                    <div className="flex flex-col gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="w-2.5 h-2.5 bg-red-600 rounded-full animate-pulse"></span>
                          <span className="text-[10px] font-black uppercase tracking-wider text-red-600">
                            ANOMALY DETECTED
                          </span>
                        </div>
                        <h4 className="text-sm font-black text-slate-800 uppercase leading-snug">
                          {selectedFrame.defects[0].defect_type}
                        </h4>
                        <p className="text-xs font-semibold text-slate-505 font-mono mt-1">
                          SEVERITY: <span className={selectedFrame.defects[0].severity === 'CRITICAL' ? 'text-red-600 font-extrabold' : 'text-amber-500'}>{selectedFrame.defects[0].severity}</span>
                        </p>
                        
                        <p className="text-xs font-medium text-slate-600 leading-relaxed mt-4 bg-slate-50 p-3 rounded border border-slate-100 italic">
                          "{selectedFrame.defects[0].ai_notes || `Computer vision model flagged visual discrepancy matching target classes with ${Math.round(selectedFrame.defects[0].confidence * 100)}% accuracy.`}"
                        </p>
                      </div>

                      <div className="pt-4 border-t border-slate-100">
                        <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase mb-1">
                          <span>Model Confidence</span>
                          <span>{Math.round(selectedFrame.defects[0].confidence * 100)}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${selectedFrame.defects[0].severity === 'CRITICAL' ? 'bg-red-500' : 'bg-amber-500'}`}
                            style={{ width: `${Math.round(selectedFrame.defects[0].confidence * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></span>
                          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600">
                            NOMINAL STATUS
                          </span>
                        </div>
                        <h4 className="text-sm font-black text-slate-800 uppercase leading-snug">
                          Visual Diagnostics Clear
                        </h4>
                        <p className="text-xs font-medium text-slate-500 mt-1">
                          Coach {activeCoach} Frame #{selectedFrame?.sequence_number || '—'}
                        </p>
                        <p className="text-xs font-medium text-slate-600 leading-relaxed mt-4 bg-slate-50 p-3 rounded border border-slate-100">
                          Machine vision inspection registers no structural deviation. Suspensions, undercarriages, and safety attachments conform to baseline standards.
                        </p>
                      </div>
                      
                      {selectedFrame && coachIntel?.components_detected?.filter(
                        c => c.trigger_id === selectedFrame.trigger_id || c.frame_url === selectedFrame.cloudinary_url
                      ).length > 0 && (
                        <div className="mt-4 pt-4 border-t border-slate-100">
                          <span className="text-[9px] font-black text-slate-400 uppercase block mb-2">Detected Components</span>
                          <div className="flex flex-wrap gap-1">
                            {coachIntel.components_detected
                              .filter(c => c.trigger_id === selectedFrame.trigger_id || c.frame_url === selectedFrame.cloudinary_url)
                              .map((c, i) => (
                                <span key={i} className="text-[9px] font-bold px-2 py-0.5 rounded bg-lime-50 text-lime-700 border border-lime-200">
                                  {c.component_name || c.component_code}
                                </span>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Timeline Micro-Strip (Thumbnails) */}
              {coachFrames.length > 0 && (
                <div className="bg-slate-900 border-t border-slate-800 p-3 flex flex-col gap-2 shrink-0">
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Coach Frame Micro-timeline</span>
                    <span className="text-[9px] font-mono text-slate-400 font-bold bg-slate-800 px-2 py-0.5 rounded">
                      {coachFrames.findIndex(f => f.id === selectedFrame?.id) + 1} / {coachFrames.length} Frames
                    </span>
                  </div>
                  
                  <div className="flex gap-2 overflow-x-auto py-1 px-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                    {coachFrames.map((frame) => {
                      const isSelected = selectedFrame?.id === frame.id;
                      const hasDefects = frame.defects && frame.defects.length > 0;
                      const hasOcr = frame.ocr_results && frame.ocr_results.length > 0;
                      return (
                        <button
                          key={frame.id}
                          onClick={() => setSelectedFrame(frame)}
                          className={`relative aspect-video h-12 rounded overflow-hidden flex-shrink-0 border-2 transition-all ${isSelected ? 'border-primary scale-105 shadow-md shadow-primary/20' : 'border-slate-700 hover:border-slate-400 opacity-60 hover:opacity-100'}`}
                        >
                          <img
                            src={frame.thumbnail_url || frame.cloudinary_url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                          {hasDefects && (
                            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-600 rounded-full border border-white animate-pulse" />
                          )}
                          {hasOcr && (
                            <span className="absolute bottom-1 right-1 w-2.5 h-2.5 bg-blue-500 rounded-full border border-white" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Detection Log Table */}
            <DetectionLogTable
              frames={coachFrames}
              components={components}
              onViewFrame={(frame) => {
                setSelectedFrame(frame);
                setLayoutMode('single');
              }}
            />

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
            <span className="text-white font-mono text-xs tracking-wider">{playbackTime} / {formatTime(durationSeconds)}</span>
          </div>

          <div onClick={handleTimelineClick} className="flex-1 relative h-10 flex items-center cursor-pointer">
            {/* Timeline Track */}
            <div className="w-full h-1 bg-white/20 rounded-full" />
            
            {/* Defect Markers — placed dynamically per coach with defects */}
            {realCoaches.map((c, idx) => {
              if ((c.critical_defects || 0) === 0) return null;
              const label = c.coach_number || `B${c.coach_index + 1}`;
              const pct = ((idx + 0.5) / (realCoaches.length || 1)) * 100;
              return (
                <div 
                  key={`def-${label}`}
                  onClick={() => jumpToCoach(label)}
                  className="absolute -top-1 cursor-pointer group flex flex-col items-center"
                  style={{ left: `${pct}%` }}
                >
                  <div className="w-3 h-3 bg-red-600 rounded-full border-2 border-white hover:scale-130 transition-transform shadow" />
                  <div className="absolute -bottom-6 text-[8px] text-red-500 font-bold bg-slate-900 border border-red-900/40 px-1 rounded whitespace-nowrap">
                    DEF-{label}
                  </div>
                </div>
              );
            })}

            {/* Playhead */}
            <div 
              className="absolute h-8 w-0.5 bg-primary shadow-[0_0_8px_#0052cc] z-20 pointer-events-none transition-all duration-150"
              style={{ left: `${playheadPercent}%` }}
            />

            {/* Coach Blocks Grid */}
            <div className="absolute inset-0 flex items-end pb-1 pointer-events-none">
              {coachLabels.map((label) => (
                <div 
                  key={label} 
                  className={`border-r border-white/10 text-[9px] font-mono font-bold pl-2 cursor-pointer pointer-events-auto select-none ${activeCoach === label ? 'text-primary font-black' : 'text-white/30 hover:text-white/60'}`}
                  style={{ width: `${100 / (coachLabels.length || 1)}%` }}
                  onClick={() => jumpToCoach(label)}
                >
                  {label}
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

      {/* Fullscreen Overlay Viewport */}
      {isFullscreen && (
        <div className="fixed inset-0 bg-[#faf9ff] text-[#051a3e] z-[9999] flex flex-col justify-between p-6 select-none animate-in fade-in duration-200 font-sans">
          {/* Top floating control panel */}
          <div className="flex items-center justify-between bg-white border border-[#c3c6d6]/60 rounded p-3 px-4 shadow-sm shrink-0">
            <div className="flex items-center gap-3">
              <span className="bg-[#003d9b]/10 text-[#003d9b] border border-[#003d9b]/20 text-[9px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded">
                FULLSCREEN
              </span>
              <div>
                <h4 className="text-xs font-black text-[#051a3e] uppercase tracking-wider">
                  {selectedFrame ? `Frame #${selectedFrame.sequence_number}` : 'Loading...'}
                </h4>
                <p className="text-[9px] text-[#737685] font-mono">
                  {selectedFrame ? `TRIGGER_ID: ${selectedFrame.trigger_id}` : '—'}
                </p>
              </div>
            </div>

            {/* Bounding box toggles & Zoom in Fullscreen */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1 bg-[#e9edff] border border-[#c3c6d6]/50 rounded p-0.5 shadow-sm">
                <button
                  onClick={() => setShowOcrBoxes(p => !p)}
                  title="Toggle OCR bounding boxes"
                  className={`flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${showOcrBoxes ? 'bg-[#003d9b] text-white' : 'text-[#434654] hover:text-[#051a3e]'}`}
                >
                  <ScanSearch className="w-3.5 h-3.5" /> OCR
                </button>
                <button
                  onClick={() => setShowDefectBoxes(p => !p)}
                  title="Toggle defect bounding boxes"
                  className={`flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${showDefectBoxes ? 'bg-[#ba1a1a] text-white' : 'text-[#434654] hover:text-[#051a3e]'}`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" /> Defects
                </button>
                <button
                  onClick={() => setShowComponentBoxes(p => !p)}
                  title="Toggle component detection boxes"
                  className={`flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${showComponentBoxes ? 'bg-[#004b59] text-white' : 'text-[#434654] hover:text-[#051a3e]'}`}
                >
                  <Cpu className="w-3.5 h-3.5" /> Components
                </button>
              </div>

              <div className="flex items-center gap-1.5 bg-[#e9edff] border border-[#c3c6d6]/50 rounded p-1 shadow-sm text-xs font-mono font-bold text-[#051a3e]">
                <button onClick={() => setZoomLevel(p => Math.max(50, p - 10))} className="p-1 hover:bg-[#d8e2ff] rounded cursor-pointer"><ZoomOut className="w-3.5 h-3.5 text-[#434654]" /></button>
                <span className="w-10 text-center">{zoomLevel}%</span>
                <button onClick={() => setZoomLevel(p => Math.min(200, p + 10))} className="p-1 hover:bg-[#d8e2ff] rounded cursor-pointer"><ZoomIn className="w-3.5 h-3.5 text-[#434654]" /></button>
              </div>
            </div>

            {/* Exit fullscreen button */}
            <button
              onClick={() => setIsFullscreen(false)}
              className="p-1.5 rounded bg-white hover:bg-[#e9edff] text-[#434654] hover:text-[#051a3e] transition-all cursor-pointer border border-[#c3c6d6]/60 shadow-sm"
              title="Exit Fullscreen (Esc)"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          </div>

          {/* Main viewport area */}
          <div className="flex-1 flex overflow-hidden min-h-0 relative my-4 gap-4">
            
            {/* Center: Scaled Image & Canvas Overlay */}
            <div className="flex-1 flex items-center justify-center relative overflow-hidden bg-slate-955 rounded-lg border border-slate-900 shadow-inner">
              {!selectedFrame ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <Loader2 className="w-8 h-8 animate-spin text-[#003d9b]" />
                  <span className="text-xs font-bold font-sans">Loading frame data...</span>
                </div>
              ) : (
                <>
                  {/* Step navigation overlay left */}
                  <button
                    onClick={() => {
                      const idx = coachFrames.findIndex(f => f.id === selectedFrame.id);
                      if (idx !== -1) {
                        const prevIdx = (idx - 1 + coachFrames.length) % coachFrames.length;
                        setSelectedFrame(coachFrames[prevIdx]);
                      }
                    }}
                    className="absolute left-3 w-8 h-8 bg-slate-900/40 hover:bg-slate-900/80 text-white rounded-full border border-slate-800/40 z-30 transition-all cursor-pointer flex items-center justify-center hover:scale-105"
                    title="Previous Frame (ArrowLeft)"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <div className="w-full h-full flex items-center justify-center p-8 transition-transform duration-200" style={{ transform: `scale(${zoomLevel / 100})` }}>
                    <div className="relative max-w-full max-h-full">
                      <img
                        ref={fullscreenImgRef}
                        src={selectedFrame.cloudinary_url}
                        alt={`Fullscreen Frame ${selectedFrame.sequence_number}`}
                        className="max-w-full max-h-full object-contain rounded border border-slate-900 shadow-2xl block mx-auto"
                        onLoad={drawFullscreenOverlay}
                      />
                      <canvas
                        ref={fullscreenCanvasRef}
                        className="absolute inset-0 pointer-events-none rounded"
                      />
                    </div>
                  </div>

                  {/* Step navigation overlay right */}
                  <button
                    onClick={() => {
                      const idx = coachFrames.findIndex(f => f.id === selectedFrame.id);
                      if (idx !== -1) {
                        const nextIdx = (idx + 1) % coachFrames.length;
                        setSelectedFrame(coachFrames[nextIdx]);
                      }
                    }}
                    className="absolute right-3 w-8 h-8 bg-slate-900/40 hover:bg-slate-900/80 text-white rounded-full border border-slate-800/40 z-30 transition-all cursor-pointer flex items-center justify-center hover:scale-105"
                    title="Next Frame (ArrowRight)"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
