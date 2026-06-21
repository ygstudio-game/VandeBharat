import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShieldCheck, ShieldX, SkipForward, Loader2, AlertTriangle, Download,
  Train, Layers, Gauge as GaugeIcon, CheckCircle2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '../contexts/AuthContext';
import { getPendingReviewDefects, reviewDefect, downloadYoloDataset } from '../lib/api';
import { toast } from '../hooks/useToast';

const SEVERITY_BADGE = {
  CRITICAL: 'bg-red-50 text-red-700 border-red-200',
  HIGH: 'bg-orange-50 text-orange-700 border-orange-200',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200',
  LOW: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

function BboxOverlay({ frameUrl, bbox, frameWidth, frameHeight }) {
  const hasBox = bbox && frameWidth && frameHeight;
  return (
    <div className="relative bg-slate-900 rounded-lg overflow-hidden">
      <img src={frameUrl} alt="defect frame" className="w-full h-auto block" />
      {hasBox && (
        <div
          className="absolute border-2 border-red-500 shadow-[0_0_0_2px_rgba(0,0,0,0.4)]"
          style={{
            left: `${(bbox.x / frameWidth) * 100}%`,
            top: `${(bbox.y / frameHeight) * 100}%`,
            width: `${(bbox.w / frameWidth) * 100}%`,
            height: `${(bbox.h / frameHeight) * 100}%`,
          }}
        />
      )}
    </div>
  );
}

export function DefectVerificationConsole() {
  const { isAdmin } = useAuth();
  const [queue, setQueue] = useState([]);
  const [total, setTotal] = useState(0);
  const [index, setIndex] = useState(0);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);
  const notesRef = useRef(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPendingReviewDefects(50, 0);
      setQueue(data.defects || []);
      setTotal(data.total || 0);
      setIndex(0);
    } catch {
      toast.error('Could not load pending review queue.', 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  const current = queue[index] || null;

  const advance = useCallback(() => {
    setNotes('');
    if (index + 1 < queue.length) {
      setIndex((i) => i + 1);
    } else {
      loadQueue(); // queue exhausted — refetch for whatever's still pending
    }
  }, [index, queue.length, loadQueue]);

  const handleReview = useCallback(async (status) => {
    if (!current || submitting) return;
    setSubmitting(true);
    try {
      await reviewDefect(current.id, status, notes.trim() || undefined);
      setReviewedCount((c) => c + 1);
      toast.success(status === 'confirmed' ? 'Defect confirmed.' : 'Marked false positive.', 'Reviewed');
      advance();
    } catch (err) {
      toast.error(err.message || 'Review failed', 'Error');
    } finally {
      setSubmitting(false);
    }
  }, [current, notes, submitting, advance]);

  // Keyboard shortcuts: C=confirm, R=reject, N=next (skip, no action taken)
  useEffect(() => {
    const onKey = (e) => {
      if (document.activeElement === notesRef.current) return; // typing notes — don't hijack keys
      if (submitting || !current) return;
      if (e.key === 'c' || e.key === 'C') handleReview('confirmed');
      else if (e.key === 'r' || e.key === 'R') handleReview('false_positive');
      else if (e.key === 'n' || e.key === 'N') advance();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, submitting, handleReview, advance]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadYoloDataset();
      toast.success('YOLO dataset downloaded.', 'Export Complete');
    } catch (err) {
      toast.error(err.message || 'Export failed — need at least one confirmed defect with bbox + frame size.', 'Error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">DEFECT VERIFICATION CONSOLE</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review AI-detected defects. <kbd className="px-1.5 py-0.5 bg-slate-100 border border-border rounded text-[10px] font-mono">C</kbd> confirm ·{' '}
            <kbd className="px-1.5 py-0.5 bg-slate-100 border border-border rounded text-[10px] font-mono">R</kbd> reject ·{' '}
            <kbd className="px-1.5 py-0.5 bg-slate-100 border border-border rounded text-[10px] font-mono">N</kbd> skip
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 border border-border rounded hover:bg-secondary disabled:opacity-50 shrink-0"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Export YOLO Dataset
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 text-xs font-bold text-muted-foreground">
        <span className="flex items-center gap-1"><Layers className="w-3.5 h-3.5" /> {total} pending</span>
        <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" /> {reviewedCount} reviewed this session</span>
      </div>

      {loading ? (
        <div className="h-96 flex items-center justify-center text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : !current ? (
        <Card className="border border-border shadow-sm">
          <CardContent className="p-12 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
            <p className="text-sm font-bold text-foreground">Queue is empty — nothing pending review.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <BboxOverlay
              frameUrl={current.annotated_frame_url || current.frame_url}
              bbox={current.bbox}
              frameWidth={current.frame_width}
              frameHeight={current.frame_height}
            />
            {!current.frame_width && (
              <p className="text-[10px] text-amber-600 mt-2 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Frame dimensions unknown — bbox overlay not drawn, YOLO export will skip this one.
              </p>
            )}
          </div>

          <div className="space-y-4">
            <Card className="border border-border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
                  {current.defect_type}
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${SEVERITY_BADGE[current.severity] || ''}`}>
                    {current.severity}
                  </span>
                </CardTitle>
                <CardDescription className="text-xs flex items-center gap-1">
                  <GaugeIcon className="w-3 h-3" /> AI confidence: {(current.confidence * 100).toFixed(1)}%
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="flex items-center gap-1.5 text-muted-foreground font-semibold">
                  <Train className="w-3.5 h-3.5" /> {current.train_number} · Coach {current.coach_number || '—'}
                  {current.coach_type && <span className="text-[10px] uppercase">({current.coach_type})</span>}
                </div>
                <div className="text-muted-foreground">Session {current.session_code}</div>
                {current.ai_notes && <p className="text-muted-foreground italic">"{current.ai_notes}"</p>}
              </CardContent>
            </Card>

            <textarea
              ref={notesRef}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional review notes…"
              rows={3}
              className="w-full px-3 py-2 border border-border rounded text-xs focus:outline-none focus:border-primary resize-none"
            />

            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={() => handleReview('confirmed')}
                disabled={submitting}
                className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase py-2.5 rounded disabled:opacity-50"
              >
                <ShieldCheck className="w-4 h-4" /> Confirm (C)
              </button>
              <button
                onClick={() => handleReview('false_positive')}
                disabled={submitting}
                className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase py-2.5 rounded disabled:opacity-50"
              >
                <ShieldX className="w-4 h-4" /> Reject (R)
              </button>
              <button
                onClick={advance}
                disabled={submitting}
                className="flex items-center justify-center gap-2 border border-border text-muted-foreground hover:bg-secondary text-xs font-bold uppercase py-2 rounded disabled:opacity-50"
              >
                <SkipForward className="w-3.5 h-3.5" /> Skip (N)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
