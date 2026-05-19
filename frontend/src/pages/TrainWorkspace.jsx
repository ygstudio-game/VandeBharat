import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { HierarchyTree } from '../components/workspace/HierarchyTree';
import { mockTrainSession } from '../data/mockData';
import { 
  ArrowLeft, 
  Cpu, 
  Train,
  ShieldAlert, 
  Activity, 
  Play, 
  Pause,
  Maximize2,
  ZoomIn,
  ZoomOut,
  ChevronRight,
  ShieldQuestion,
  FileCheck,
  LayoutGrid,
  Maximize,
  Sparkles,
  Info,
  CheckCircle,
  Eye,
  Settings,
  Flame,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

// High-resolution public machine-vision inspection imagery URLs for Indian Railways industrial UI
const IMAGE_URLS = {
  ocr: "https://lh3.googleusercontent.com/aida-public/AB6AXuDp-yAqkawZsis3uLYwWIUKYT54GH2yrk8_IIFBZ2maBB7EsgRiOljlWVRm0d3nbYYpbu-T0fI46IEoqlID21Lbb6d8I5QRoZHU1pQ1AEP8GX-6gKi0u1VT1QdwXjHgvUazZqhEYBIGoye0ErfNQNfye_rmmsr2ZhNZ0TzvbSjQykgwIGHUvLK46uqW1fzp24zoFF0FUoiFnbyJzoskjVunABk2vwoPyXmJfIbuVLg4V_yCOjP4Rn98jBWgr6npexnsF2jXbtgcuDpJ",
  bogieLeft: "https://lh3.googleusercontent.com/aida-public/AB6AXuAREsnjdkzZ8kGeUuGm4ltRMazYeuhowNjkMYy_bpp7Qyy8HJMcXhoLGUuUHflOkLk6QblN5cZPcDnQePR2IDXg2Wtr6dDSUcvSp4jTamaQDDMGiRqLinAOac69IBCYu_yM6ezehmlzPmjW01Mq4cRRV-r1_BBV4r9XLRp67vpv3r4ApxQY2VHHlcV8K4gZIKewRL3EloYK0NnbIyiVbj3FHzNJyXdtflzC8rGXgR1gZXb2oaLbJPAKszsqLi4PU5Hhrk0FaiQdtOrX",
  bogieRight: "https://lh3.googleusercontent.com/aida-public/AB6AXuAR7ZbpaxfL1HPZjjDstLRszdnyLN_TTaL9VjNNhvlsKN9Ia-fcz7QspOyO6TWls6N25ZUikMFNBOEQaP55axfkFLGQ5RpdmeZDceUK6A7nORCIJEKpXYqeYCcdtERfYPuaQTE6Fb7IFggCZlPRFR1HKYRs_qqC-76SRAfr9RrBV8w0CRE2pr3CWuIZmwPciqxQ0Hy0b09VfG4KkWD4DKD65nKyb4HAMMeIlXddmfshDvO0dZjHBIq9uOeVMT6d98YhdUvQ1rFj_vd6",
  undercarriage: "https://lh3.googleusercontent.com/aida-public/AB6AXuByQ9SimdZcyIClLY8ie9ri_ZH5BfIsvN4nNtAtRCq48E2xAbtK09HzMVtW6Mu6A8dLxtxNPslPd-viyyv433LPFVCkG-VS8NUbylJFspP206oUj2JmauRUvQdU2Dfqcg91bt1fbgjKqQ60O8zfSy6FYEo-2PRs8TgMQpM0lY9-snosy0wws9udJjH6QO-J4S66cekg5nTlDfRx1pS2r03rWFdJhZSE3x9kCz68TJitAZnujx4WuR-xuF_biDqlORuxSfYLhIRCtd_a",
  wheelSet: "https://lh3.googleusercontent.com/aida-public/AB6AXuBLlLt72byTN6gSVOmZLkmLDojUK7FphGNPGqo3B-5lktIz8GGgGT7K3UBILEo5phEZRyoko6DCTuSIEvsMcpx2fS4cod88RU7U8CnppP5iT8KJgsBRQBCzoyiGMBQsdjs03KMu0L3VBFputuvEr-3D9qJy4wMvvKDCqcW56Nc_RGC6_CMbHYvV6SqlS1RdGKIDh4uQAU_g-XHn1a0KGKnhYHPsUxU55MrUk7KXhiUVfPvmMRrhlCoKjdC3Pow7X4Akz83PYqqKZyw6"
};

const timelineAnchors = [
  { frame: 1245, type: 'OCR', label: 'Bogie B1 Anchor', coachId: 'coach-b1', nodeId: 'coach-b1-ocr', color: 'bg-blue-600' },
  { frame: 1421, type: 'DEFECT', label: 'Brake Pad Crack', coachId: 'coach-b1', nodeId: 'coach-b1-components', color: 'bg-red-600' },
  { frame: 1489, type: 'DEFECT', label: 'Missing Pin', coachId: 'coach-b1', nodeId: 'coach-b1-components', color: 'bg-amber-500' },
  { frame: 2088, type: 'GAP', label: 'Gap B1-B2', coachId: 'coach-b1', nodeId: 'coach-b1-cams', color: 'bg-slate-400' },
  { frame: 2200, type: 'OCR', label: 'Bogie B2 Anchor', coachId: 'coach-b2', nodeId: 'coach-b2-ocr', color: 'bg-blue-600' },
  { frame: 2510, type: 'DEFECT', label: 'Loose Coupling Bolt', coachId: 'coach-b2', nodeId: 'coach-b2-components', color: 'bg-red-600' },
  { frame: 3154, type: 'OCR', label: 'Bogie B3 Anchor', coachId: 'coach-b3', nodeId: 'coach-b3-ocr', color: 'bg-blue-600' },
  { frame: 4012, type: 'OCR', label: 'Bogie B4 Anchor', coachId: 'coach-b4', nodeId: 'coach-b4-ocr', color: 'bg-blue-600' }
];

export const TrainWorkspace = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  
  // Selection state
  const [selectedNode, setSelectedNode] = useState({
    type: 'coach',
    id: 'coach-b1',
    coachNumber: 'B1'
  });
  
  // Viewer and Playback States
  const [viewMode, setViewMode] = useState('component'); // 'raw' | 'ocr' | 'component'
  const [layoutMode, setLayoutMode] = useState('single'); // 'single' | 'grid'
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeFrameIndex, setActiveFrameIndex] = useState(1); // Default to frame showing defect
  const [zoomLevel, setZoomLevel] = useState(100);

  // Auto-play simulation
  useEffect(() => {
    let interval;
    if (isPlaying) {
      interval = setInterval(() => {
        setActiveFrameIndex(prev => (prev + 1) % timelineAnchors.length);
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Jump to specific frame anchor
  const handleJumpToAnchor = (anchor) => {
    setSelectedNode({
      type: anchor.type === 'OCR' ? 'ocr' : 'components',
      id: anchor.nodeId,
      coachNumber: anchor.coachId.replace('coach-', '').toUpperCase()
    });
    const anchorIdx = timelineAnchors.findIndex(a => a.frame === anchor.frame);
    if (anchorIdx !== -1) {
      setActiveFrameIndex(anchorIdx);
    }
    if (anchor.type === 'OCR') {
      setViewMode('ocr');
    } else {
      setViewMode('component');
    }
  };

  // Determine current active node based on frame index
  const activeAnchor = timelineAnchors[activeFrameIndex];

  // Selected coach data
  const currentCoachId = selectedNode.id.split('-')[0] || 'coach-b1';
  const currentCoachNum = selectedNode.coachNumber || 'B1';

  // Mock coach content builder
  const getCoachData = (coachNum) => {
    switch (coachNum) {
      case 'B1':
        return {
          title: "Bogie B1 Left Side assembly",
          ocrConfidence: "98.4%",
          syncStability: "99.1% Stable",
          components: [
            { id: "c1", name: "Brake Pad Wear Guide", expected: true, detected: true, status: "OK", conf: 0.99 },
            { id: "c2", name: "Retaining Suspension Pin", expected: true, detected: false, status: "MISSING", conf: 0.0 },
            { id: "c3", name: "Primary Coil Springs", expected: true, detected: true, status: "OK", conf: 0.97 },
            { id: "c4", name: "Damper Assembly Bracket", expected: true, detected: true, status: "OK", conf: 0.98 }
          ],
          defects: [
            { id: "d1", name: "Brake Pad Fatigue Fracture", type: "CRITICAL_CRACK", severity: "CRITICAL", cam: "CAM_LEFT_01", conf: "94%", notes: "Transverse structural fracture on inner pad face. Immediate replacement scheduled." },
            { id: "d2", name: "Missing Suspension Anchor Pin", type: "MISSING_HARDWARE", severity: "REVIEW", cam: "CAM_LEFT_01", conf: "98%", notes: "Anchor pin empty. Secondary safety cable intact but loose." }
          ],
          image: IMAGE_URLS.bogieLeft,
          gridImages: [IMAGE_URLS.bogieLeft, IMAGE_URLS.wheelSet, IMAGE_URLS.undercarriage, IMAGE_URLS.ocr]
        };
      case 'B2':
        return {
          title: "Bogie B2 Under-Coupling Assembly",
          ocrConfidence: "99.2%",
          syncStability: "99.8% Stable",
          components: [
            { id: "c1", name: "Brake Pad Wear Guide", expected: true, detected: true, status: "OK", conf: 0.99 },
            { id: "c2", name: "Retaining Suspension Pin", expected: true, detected: true, status: "OK", conf: 0.99 },
            { id: "c3", name: "Bogie Coupling Bolts", expected: true, detected: true, status: "OK", conf: 0.95 },
            { id: "c4", name: "Lateral Damper Mount", expected: true, detected: true, status: "OK", conf: 0.97 }
          ],
          defects: [
            { id: "d1", name: "Loose Bogie Coupling Bolt", type: "LOOSE_HARDWARE", severity: "CRITICAL", cam: "CAM_RIGHT_02", conf: "89%", notes: "Bolt shifted outwards by 15mm. Structural safety threshold exceeded." }
          ],
          image: IMAGE_URLS.bogieRight,
          gridImages: [IMAGE_URLS.bogieRight, IMAGE_URLS.undercarriage, IMAGE_URLS.wheelSet, IMAGE_URLS.ocr]
        };
      case 'B3':
        return {
          title: "Bogie B3 Undercarriage",
          ocrConfidence: "97.1%",
          syncStability: "95.4% Stable",
          components: [
            { id: "c1", name: "Brake Pad Wear Guide", expected: true, detected: true, status: "OK", conf: 0.98 },
            { id: "c2", name: "Retaining Suspension Pin", expected: true, detected: true, status: "OK", conf: 0.99 },
            { id: "c3", name: "Primary Coil Springs", expected: true, detected: true, status: "OK", conf: 0.99 }
          ],
          defects: [],
          image: IMAGE_URLS.undercarriage,
          gridImages: [IMAGE_URLS.undercarriage, IMAGE_URLS.wheelSet, IMAGE_URLS.bogieLeft, IMAGE_URLS.ocr]
        };
      default:
        return {
          title: "Bogie Wheelset Assembly",
          ocrConfidence: "98.9%",
          syncStability: "99.5% Stable",
          components: [
            { id: "c1", name: "Axle Shaft Interface", expected: true, detected: true, status: "OK", conf: 0.99 },
            { id: "c2", name: "Brake Disc Assembly", expected: true, detected: true, status: "OK", conf: 0.99 }
          ],
          defects: [],
          image: IMAGE_URLS.wheelSet,
          gridImages: [IMAGE_URLS.wheelSet, IMAGE_URLS.undercarriage, IMAGE_URLS.bogieRight, IMAGE_URLS.ocr]
        };
    }
  };

  const coachData = getCoachData(currentCoachNum);

  const handleSelectNode = (type, id, metadata) => {
    const num = metadata?.coachNumber || id.split('-')[1]?.toUpperCase() || 'B1';
    setSelectedNode({
      type,
      id,
      coachNumber: num
    });
    if (type === 'ocr') {
      setViewMode('ocr');
    } else {
      setViewMode('component');
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-[#faf9ff] overflow-hidden font-sans">
      
      {/* 1. Header segment */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between z-10 shrink-0 shadow-sm">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/sessions')}
            className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-500 hover:text-slate-900 border border-slate-200 bg-white"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          
          <div className="space-y-0.5">
            <div className="flex items-center gap-3">
              <h2 className="text-md font-black text-slate-900 uppercase tracking-tight flex items-center gap-1.5">
                <Train className="w-5 h-5 text-primary" />
                Train Workspace: {mockTrainSession.trainNumber}
              </h2>
              <Badge className="font-extrabold text-[9px] uppercase px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                Synchronizing Coaches...
              </Badge>
              <span className="text-[10px] font-mono text-slate-400 font-bold bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                SESSION: {sessionId || "SES-22901-A"}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 font-bold font-mono">
              SYS_TELEMETRY: 14,221 FRAMES | 6 ACTIVE CAMERAS | 18 COACHES SEGMENTED
            </p>
          </div>
        </div>

        {/* Telemetry Strip */}
        <div className="flex items-center gap-6 text-xs font-mono font-bold">
          <div className="text-right">
            <span className="text-[9px] text-slate-400 block leading-none mb-1">OCR CONFIDENCE</span>
            <span className="text-slate-900 font-extrabold">{coachData.ocrConfidence}</span>
          </div>
          <div className="text-right">
            <span className="text-[9px] text-slate-400 block leading-none mb-1">SYNC STABILITY</span>
            <span className="text-slate-900 font-extrabold">{coachData.syncStability}</span>
          </div>
          <div className="text-right">
            <span className="text-[9px] text-slate-400 block leading-none mb-1">CRITICAL ALERTS</span>
            <span className="text-red-600 font-black animate-pulse bg-red-50 border border-red-200 px-2 py-0.5 rounded">
              {coachData.defects.filter(d => d.severity === 'CRITICAL').length} CRIT
            </span>
          </div>
          
          <button className="bg-primary hover:bg-slate-800 text-white px-4 py-2 rounded text-[10px] uppercase font-bold tracking-wider shadow-sm transition-all flex items-center gap-1.5">
            <FileCheck className="w-4 h-4" />
            Export Audit Report
          </button>
        </div>
      </div>

      {/* 2. Pipeline timeline progress bar */}
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-2 shrink-0 flex flex-wrap items-center justify-between text-[10px] font-bold text-slate-500 shadow-inner gap-2">
        <div className="flex items-center gap-2 w-full md:w-1/3">
          <span className="font-mono text-slate-400">PIPELINE:</span>
          <Progress value={72} className="h-2 bg-slate-200 flex-1 rounded-full" />
          <span className="font-mono text-slate-900">72%</span>
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          <span className="px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 font-black">
            ✓ FRAMES
          </span>
          <ChevronRight className="w-3 h-3 text-slate-400" />
          <span className="px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 font-black">
            ✓ OCR
          </span>
          <ChevronRight className="w-3 h-3 text-slate-400" />
          <span className="px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700 font-black animate-pulse">
            ~ SYNCHRONIZATION
          </span>
          <ChevronRight className="w-3 h-3 text-slate-400" />
          <span className="px-2 py-0.5 rounded border border-slate-200 bg-slate-100 text-slate-400">
            • COMPONENTS
          </span>
          <ChevronRight className="w-3 h-3 text-slate-400" />
          <span className="px-2 py-0.5 rounded border border-slate-200 bg-slate-100 text-slate-400">
            • DEFECTS
          </span>
          <ChevronRight className="w-3 h-3 text-slate-400" />
          <span className="px-2 py-0.5 rounded border border-slate-200 bg-slate-100 text-slate-400">
            • REPORT
          </span>
        </div>
      </div>

      {/* 3. Three-Panel Grid */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        
        {/* Left Panel: Bogie Hierarchy Tree */}
        <div className="w-80 border-r border-slate-200 p-4 shrink-0 flex flex-col h-full bg-white">
          <div className="mb-3">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Fleet Hierarchy Tree</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase">Frame Anchors & Camera Feeds</p>
          </div>
          <div className="flex-1 min-h-0">
            <HierarchyTree onSelectNode={handleSelectNode} />
          </div>
        </div>

        {/* Center Panel: Evidence Viewer */}
        <div className="flex-1 flex flex-col min-w-0 p-4 bg-slate-50">
          
          {/* Viewer Controls */}
          <div className="flex justify-between items-center mb-3 shrink-0">
            <div className="flex items-center gap-1 bg-white p-1 rounded border border-slate-200 shadow-sm">
              <button 
                onClick={() => setViewMode('raw')}
                className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all ${viewMode === 'raw' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                Raw View
              </button>
              <button 
                onClick={() => setViewMode('ocr')}
                className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all ${viewMode === 'ocr' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                OCR View
              </button>
              <button 
                onClick={() => setViewMode('component')}
                className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all ${viewMode === 'component' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                AI Overlay
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center bg-white border border-slate-200 rounded p-0.5 shadow-sm">
                <button 
                  onClick={() => setLayoutMode('single')}
                  className={`p-1.5 rounded transition-all ${layoutMode === 'single' ? 'bg-slate-100 text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
                  title="Single Camera Focus"
                >
                  <Maximize className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={() => setLayoutMode('grid')}
                  className={`p-1.5 rounded transition-all ${layoutMode === 'grid' ? 'bg-slate-100 text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
                  title="Multi-Camera Grid View"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded p-1 shadow-sm text-xs font-mono font-bold">
                <button onClick={() => setZoomLevel(prev => Math.max(50, prev - 10))} className="p-1 hover:bg-slate-50 rounded"><ZoomOut className="w-3.5 h-3.5 text-slate-500" /></button>
                <span className="w-10 text-center">{zoomLevel}%</span>
                <button onClick={() => setZoomLevel(prev => Math.min(200, prev + 10))} className="p-1 hover:bg-slate-50 rounded"><ZoomIn className="w-3.5 h-3.5 text-slate-500" /></button>
              </div>
            </div>
          </div>

          {/* Primary Viewport Area */}
          <div className="flex-1 bg-slate-900 rounded-lg flex flex-col justify-between p-4 relative overflow-hidden shadow-inner border border-slate-950">
            {/* Dark grid overlay effect */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.15)_50%)] bg-[size:100%_4px] pointer-events-none z-10" />

            {/* Top metadata info card */}
            <div className="flex justify-between items-start text-[10px] font-mono text-slate-300 bg-slate-950/80 p-2.5 rounded border border-slate-800 backdrop-blur z-20">
              <div className="space-y-0.5">
                <p><span className="text-slate-500">CAMERA_FEED:</span> {viewMode === 'ocr' ? 'CAM_00_OCR_FRONT' : 'CAM_01_LEFT_ASSEMBLY'}</p>
                <p><span className="text-slate-500">BOGIE_MAPPED:</span> Coach {currentCoachNum}</p>
              </div>
              <div className="text-right space-y-0.5">
                <p><span className="text-slate-500">FRAME_NUM:</span> #{activeAnchor?.frame || 1421}</p>
                <p><span className="text-slate-500">SYS_ACC:</span> 99.1% Stable</p>
              </div>
            </div>

            {/* Viewport Content */}
            <div className="absolute inset-0 flex items-center justify-center p-8 overflow-hidden">
              {layoutMode === 'single' ? (
                // Single camera focus view
                <div 
                  className="w-full h-full relative flex items-center justify-center transition-transform duration-300"
                  style={{ transform: `scale(${zoomLevel / 100})` }}
                >
                  <img 
                    src={viewMode === 'ocr' ? IMAGE_URLS.ocr : coachData.image} 
                    alt={coachData.title}
                    className="max-w-full max-h-full object-contain rounded border border-slate-800 shadow-2xl"
                  />
                  
                  {/* Bounding box AI overlays */}
                  {viewMode === 'component' && currentCoachNum === 'B1' && (
                    <>
                      {/* Critical Crack overlay */}
                      <div 
                        className="absolute border-2 border-red-500 bg-red-500/20 text-white text-[9px] font-black p-1.5 rounded z-20 shadow-[0_0_15px_rgba(239,68,68,0.6)] animate-pulse"
                        style={{ top: '48%', left: '38%', width: '130px', height: '90px' }}
                      >
                        <div className="flex items-center gap-1 bg-red-600 px-1 py-0.5 rounded text-[8px] uppercase">
                          <Flame className="w-2.5 h-2.5" /> Critical Crack
                        </div>
                        <p className="mt-1 font-mono text-[8px] opacity-90">Brake Fatigue Fracture</p>
                        <p className="font-mono text-[8px] font-bold text-red-300">Conf: 94.2%</p>
                      </div>

                      {/* Missing hardware warning overlay */}
                      <div 
                        className="absolute border-2 border-amber-500 bg-amber-500/20 text-white text-[9px] font-black p-1.5 rounded z-20 shadow-[0_0_15px_rgba(245,158,11,0.6)]"
                        style={{ top: '22%', left: '60%', width: '110px', height: '80px' }}
                      >
                        <div className="flex items-center gap-1 bg-amber-600 px-1 py-0.5 rounded text-[8px] uppercase">
                          <AlertTriangle className="w-2.5 h-2.5" /> Missing Pin
                        </div>
                        <p className="mt-1 font-mono text-[8px] opacity-90">Suspension Pin Empty</p>
                        <p className="font-mono text-[8px] font-bold text-amber-300">Conf: 98.0%</p>
                      </div>
                    </>
                  )}

                  {viewMode === 'component' && currentCoachNum === 'B2' && (
                    /* Loose bolt overlay */
                    <div 
                      className="absolute border-2 border-red-500 bg-red-500/20 text-white text-[9px] font-black p-1.5 rounded z-20 shadow-[0_0_15px_rgba(239,68,68,0.6)] animate-pulse"
                      style={{ top: '60%', left: '50%', width: '120px', height: '90px' }}
                    >
                      <div className="flex items-center gap-1 bg-red-600 px-1 py-0.5 rounded text-[8px] uppercase">
                        <Flame className="w-2.5 h-2.5" /> Loose Bolt
                      </div>
                      <p className="mt-1 font-mono text-[8px] opacity-90">Bogie Coupling Bolt Shift</p>
                      <p className="font-mono text-[8px] font-bold text-red-300">Conf: 89.1%</p>
                    </div>
                  )}

                  {viewMode === 'ocr' && (
                    /* OCR anchor overlay */
                    <div 
                      className="absolute border-2 border-emerald-500 bg-emerald-500/20 text-white text-[9px] font-black p-1.5 rounded z-20 shadow-[0_0_15px_rgba(16,185,129,0.6)]"
                      style={{ top: '15%', left: '10%', width: '180px', height: '60px' }}
                    >
                      <div className="flex items-center gap-1 bg-emerald-600 px-1 py-0.5 rounded text-[8px] uppercase">
                        <CheckCircle className="w-2.5 h-2.5" /> Coach Mapped
                      </div>
                      <p className="mt-1 font-mono text-sm font-black text-emerald-300 text-center">BOGIE_{currentCoachNum}</p>
                    </div>
                  )}
                </div>
              ) : (
                // Multi camera grid layout mode
                <div className="w-full h-full grid grid-cols-2 gap-3 transition-transform duration-300" style={{ transform: `scale(${zoomLevel / 100})` }}>
                  {coachData.gridImages.map((img, i) => (
                    <div key={i} className="relative bg-slate-950 border border-slate-800 rounded overflow-hidden flex items-center justify-center">
                      <img src={img} alt="Camera Feed" className="w-full h-full object-cover opacity-80 hover:opacity-100 transition-opacity" />
                      <div className="absolute bottom-1 left-1 bg-slate-950/80 px-1.5 py-0.5 rounded font-mono text-[8px] text-slate-300 border border-slate-800">
                        CAM_0{i + 1} feed
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Neural status info float */}
            <div className="self-center bg-slate-950/90 text-[9px] text-emerald-400 font-mono px-3 py-1.5 rounded-full border border-emerald-950 backdrop-blur z-20 shadow-md flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
              <span>Neural Pipeline Active | Latency: 11ms | FPS: 24.2 | Inference: GPU_NODE_04</span>
            </div>

            {/* Playback controller strip */}
            <div className="w-full bg-slate-950/95 p-3 border border-slate-800 rounded flex items-center justify-between text-[10px] font-mono text-slate-300 backdrop-blur z-20">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-1.5 hover:bg-slate-800 rounded text-slate-100 bg-slate-900 border border-slate-800 transition-colors"
                >
                  {isPlaying ? <Pause className="w-4 h-4 text-primary" /> : <Play className="w-4 h-4 text-emerald-400" />}
                </button>
                <span className="font-bold text-[9px] uppercase tracking-wider text-slate-400">Sync Pipeline Replay</span>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setActiveFrameIndex(prev => Math.max(0, prev - 1))}
                  className="px-2.5 py-1 hover:bg-slate-800 border border-slate-800 rounded bg-slate-900 text-[9px] uppercase font-bold transition-all"
                >
                  Previous Frame
                </button>
                <span className="text-slate-400 font-bold bg-slate-900 px-2 py-1 rounded border border-slate-800">
                  Frame {activeFrameIndex + 1} / {timelineAnchors.length}
                </span>
                <button 
                  onClick={() => setActiveFrameIndex(prev => Math.min(timelineAnchors.length - 1, prev + 1))}
                  className="px-2.5 py-1 hover:bg-slate-800 border border-slate-800 rounded bg-slate-900 text-[9px] uppercase font-bold transition-all"
                >
                  Next Frame
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel: Intelligence Details */}
        <div className="w-96 border-l border-slate-200 p-4 shrink-0 flex flex-col h-full bg-white">
          <div className="mb-4">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">AI Intelligence Feed</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase">Bogie Compliance Diagnostic Logs</p>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Defect Cards Section */}
            <div>
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5 text-red-600" /> Detected Defects ({coachData.defects.length})
              </h4>
              
              {coachData.defects.length === 0 ? (
                <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded text-center text-xs text-emerald-800 font-medium">
                  ✓ Bogie is fully compliant. No defects found.
                </div>
              ) : (
                <div className="space-y-2">
                  {coachData.defects.map((defect) => (
                    <div 
                      key={defect.id} 
                      className={`p-3 rounded border text-xs transition-all ${defect.severity === 'CRITICAL' ? 'bg-red-50/50 border-red-200' : 'bg-amber-50/50 border-amber-200'}`}
                    >
                      <div className="flex justify-between items-start gap-2 mb-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${defect.severity === 'CRITICAL' ? 'bg-red-600 text-white' : 'bg-amber-600 text-white'}`}>
                          {defect.severity}
                        </span>
                        <span className="font-mono text-[9px] font-bold text-slate-500 bg-white border border-slate-200 px-1 rounded">
                          {defect.type}
                        </span>
                      </div>
                      <p className="font-black text-slate-900 mb-0.5">{defect.name}</p>
                      <p className="text-[10px] text-slate-500 font-semibold mb-2">{defect.notes}</p>
                      
                      <div className="flex justify-between items-center font-mono text-[9px] border-t border-dashed border-slate-200 pt-2 text-slate-400">
                        <span>CAMERA: {defect.cam}</span>
                        <span className="text-slate-900 font-bold bg-white border px-1 rounded">Confidence: {defect.conf}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Component Compliance Checklist */}
            <Card className="border border-slate-200 shadow-sm bg-white">
              <CardHeader className="p-3 border-b border-slate-100 bg-slate-50/50">
                <CardTitle className="text-[10px] font-black tracking-wider uppercase text-slate-400 flex items-center gap-1.5">
                  <FileCheck className="w-4 h-4 text-primary" /> Structural Checklist
                </CardTitle>
                <CardDescription className="text-[9px] font-bold uppercase text-slate-400">Compliance checklist for Bogie {currentCoachNum}</CardDescription>
              </CardHeader>
              <CardContent className="p-3">
                <table className="w-full text-[10px] font-mono text-left">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400">
                      <th className="pb-1.5 font-bold uppercase">Component</th>
                      <th className="pb-1.5 font-bold uppercase text-center">Expected</th>
                      <th className="pb-1.5 font-bold uppercase text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {coachData.components.map((comp) => (
                      <tr key={comp.id} className="hover:bg-slate-50">
                        <td className="py-2 font-bold text-slate-800">{comp.name}</td>
                        <td className="py-2 text-center text-slate-400">{comp.expected ? 'YES' : 'NO'}</td>
                        <td className="py-2 text-right">
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${comp.status === 'OK' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200 animate-pulse'}`}>
                            {comp.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* AI Diagnostics details */}
            <Card className="border border-slate-200 shadow-sm bg-white">
              <CardHeader className="p-3 border-b border-slate-100 bg-slate-50/50">
                <CardTitle className="text-[10px] font-black tracking-wider uppercase text-slate-400 flex items-center gap-1.5">
                  <ShieldQuestion className="w-4 h-4 text-slate-500" /> Pipeline Diagnostics
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 text-[10px] leading-relaxed text-slate-500 font-medium space-y-2">
                <div className="flex gap-2">
                  <span className="text-primary font-bold">[OCR]</span>
                  <p>Anchor plate read successful. Mapped Coach code <span className="font-mono text-slate-900 font-bold bg-slate-50 border px-1 rounded">{currentCoachNum}</span>.</p>
                </div>
                <div className="flex gap-2">
                  <span className="text-primary font-bold">[SYNC]</span>
                  <p>Coach separation algorithm detected inter-coach gap threshold (0.98 stability confidence factor).</p>
                </div>
                <div className="flex gap-2">
                  <span className="text-primary font-bold">[ML]</span>
                  <p>Completed structural scanning: 140 component elements matched design schematics.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

      </div>

      {/* 4. Bottom Sync Scrubbing Timeline */}
      <div className="h-36 bg-slate-900 border-t border-white/10 flex flex-col shrink-0 z-10 select-none">
        
        {/* Upper legend strip */}
        <div className="px-4 py-1.5 flex items-center justify-between bg-slate-950 border-b border-white/10 shrink-0">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-primary animate-pulse" /> Synchronized Timeline Scrub
          </span>
          <div className="flex items-center gap-4 text-[9px] font-bold text-slate-400 uppercase">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 border border-white/20"></span>
              <span>Defect</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 border border-white/20"></span>
              <span>OCR Anchor</span>
            </div>
            <div className="w-px h-3 bg-white/20"></div>
            <span className="font-mono text-slate-400">
              Active Frame: {activeAnchor?.frame || 1421} (Coach {currentCoachNum})
            </span>
          </div>
        </div>

        {/* Scrollable Frame Thumbnails strip */}
        <div className="flex-1 overflow-x-auto flex items-center px-4 gap-2 py-2 bg-slate-900/90">
          {timelineAnchors.map((anchor, idx) => {
            const isActive = idx === activeFrameIndex;
            // Determine image
            let imgUrl = IMAGE_URLS.bogieLeft;
            if (anchor.type === 'OCR') imgUrl = IMAGE_URLS.ocr;
            else if (anchor.type === 'GAP') imgUrl = IMAGE_URLS.undercarriage;
            else if (anchor.frame === 2510) imgUrl = IMAGE_URLS.bogieRight;
            else if (anchor.frame === 4012) imgUrl = IMAGE_URLS.wheelSet;

            return (
              <div 
                key={idx}
                onClick={() => handleJumpToAnchor(anchor)}
                className={`flex-none w-24 h-16 rounded border relative cursor-pointer overflow-hidden transition-all ${isActive ? 'border-primary ring-2 ring-primary/40 bg-black/40 scale-102 font-bold' : 'border-white/10 hover:border-white/30 bg-black/20 hover:scale-102'}`}
              >
                <img 
                  className={`w-full h-full object-cover transition-opacity ${isActive ? 'opacity-85' : 'opacity-40 hover:opacity-60'}`}
                  src={imgUrl} 
                  alt={anchor.label}
                />
                
                {/* Type Badges / Overlays */}
                <div className="absolute top-1 left-1 bg-black/70 px-1 rounded text-[7px] font-mono text-white">
                  F_{anchor.frame}
                </div>

                {/* Status Dot */}
                <div className="absolute top-1 right-1">
                  {anchor.type === 'DEFECT' && (
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600 border border-white block animate-pulse"></span>
                  )}
                  {anchor.type === 'OCR' && (
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600 border border-white block"></span>
                  )}
                  {anchor.type === 'GAP' && (
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-500 border border-white block"></span>
                  )}
                </div>

                <div className="absolute bottom-1 left-1 right-1 bg-black/60 px-1 rounded text-[7px] font-sans font-bold text-white truncate text-center uppercase tracking-tight">
                  {anchor.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* Lower Playhead Scrub Track */}
        <div className="h-2 w-full bg-slate-950 relative border-t border-white/5">
          {/* Blue active region indicator */}
          <div 
            className="absolute top-0 h-full bg-primary/20 shadow-[0_0_8px_rgba(0,82,204,0.3)] transition-all duration-300"
            style={{ 
              left: `${Math.max(0, (activeFrameIndex / (timelineAnchors.length - 1)) * 90 - 5)}%`,
              width: '15%'
            }}
          />
          {/* Vertical playhead tick */}
          <div 
            className="absolute -top-1 w-0.5 h-4 bg-primary shadow-[0_0_8px_#0052cc] z-20 transition-all duration-300"
            style={{ left: `${(activeFrameIndex / (timelineAnchors.length - 1)) * 95 + 2.5}%` }}
          />
        </div>

      </div>

    </div>
  );
};
