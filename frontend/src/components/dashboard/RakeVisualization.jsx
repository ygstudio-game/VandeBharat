import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Train, ShieldAlert, AlertTriangle, CheckCircle, Loader2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

function coachStatus(coach, sessionStatus) {
  if (sessionStatus === 'QUEUED') return 'pending';
  if (!coach || (coach.total_frames || 0) === 0) return 'pending';
  if (sessionStatus === 'PROCESSING') return 'processing';
  if ((coach.critical_defects || 0) > 0) return 'critical';
  if ((coach.missing_components_count || 0) > 0) return 'warning';
  return 'clean';
}

const STATUS = {
  pending:    { bg: 'bg-slate-100 border-slate-300',           text: 'text-slate-500',   icon: <Clock className="w-3 h-3 text-slate-400" /> },
  processing: { bg: 'bg-blue-50 border-blue-300 animate-pulse', text: 'text-blue-700',   icon: <Loader2 className="w-3 h-3 animate-spin text-blue-500" /> },
  clean:      { bg: 'bg-emerald-50 border-emerald-300',         text: 'text-emerald-800', icon: <CheckCircle className="w-3 h-3 text-emerald-500" /> },
  warning:    { bg: 'bg-amber-50 border-amber-300',             text: 'text-amber-800',   icon: <AlertTriangle className="w-3 h-3 text-amber-500" /> },
  critical:   { bg: 'bg-red-50 border-red-400',                 text: 'text-red-800',     icon: <ShieldAlert className="w-3 h-3 text-red-500 animate-pulse" /> },
};

function Coupler({ wide }) {
  return <div className={cn('h-1 bg-slate-400 rounded-full flex-none', wide ? 'w-3' : 'w-2')} />;
}

export const RakeVisualization = ({ session, coaches }) => {
  const navigate = useNavigate();

  if (!session) {
    return (
      <div className="h-24 flex items-center justify-center text-sm text-muted-foreground font-semibold">
        No active session. Upload a video to start an inspection.
      </div>
    );
  }

  const sessionStatus = session.status;

  // Use real coaches; if none yet but we know count, show pending placeholders
  const placeholderCount = coaches.length === 0 ? (session.totalCoaches || 0) : 0;
  const displayCoaches = coaches.length > 0
    ? coaches
    : Array.from({ length: placeholderCount }, (_, i) => ({
        id: `ph-${i}`,
        coach_number: `C${i + 1}`,
        total_frames: 0,
        critical_defects: 0,
        missing_components_count: 0,
      }));

  if (displayCoaches.length === 0) {
    return (
      <div className="h-24 flex items-center justify-center text-sm text-muted-foreground font-semibold">
        {sessionStatus === 'QUEUED' ? 'Session queued — awaiting frame extraction…' : 'Coach data not yet available'}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Session meta row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Train className="w-4 h-4 text-primary" />
          <span className="font-black text-foreground text-sm">{session.trainNumber || '—'}</span>
          <span className="font-mono text-[10px] text-muted-foreground">{session.id?.slice(0, 8)}…</span>
          <span className={cn(
            'text-[9px] font-black uppercase px-2 py-0.5 rounded-full border',
            sessionStatus === 'PROCESSING' ? 'bg-blue-50 text-blue-700 border-blue-200' :
            sessionStatus === 'COMPLETED'  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
            sessionStatus === 'FAILED'     ? 'bg-red-50 text-red-700 border-red-200' :
                                             'bg-slate-100 text-slate-600 border-slate-200'
          )}>
            {sessionStatus}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground">
            {displayCoaches.length} coaches · {session.progressPercent ?? 0}%
          </span>
        </div>
        <button
          onClick={() => navigate(`/train/${session.id}`)}
          className="text-[10px] font-bold text-primary hover:underline cursor-pointer"
        >
          Open Workspace →
        </button>
      </div>

      {/* Horizontal rake */}
      <div className="overflow-x-auto pb-1">
        <div className="flex items-center gap-0 min-w-max">

          {/* Locomotive block */}
          <div className="w-16 h-20 rounded border-2 border-primary bg-primary/5 flex flex-col items-center justify-center gap-1 shadow-sm shrink-0">
            <Train className="w-5 h-5 text-primary" />
            <span className="text-[8px] font-black uppercase text-primary leading-none">LOCO</span>
          </div>

          <Coupler wide />

          {displayCoaches.map((coach, idx) => {
            const st = coachStatus(coach, sessionStatus);
            const cfg = STATUS[st];
            const coachNum = coach.coach_number || `C${idx + 1}`;
            const hasCritical = (coach.critical_defects || 0) > 0;
            const hasMissing  = (coach.missing_components_count || 0) > 0;

            return (
              <React.Fragment key={coach.id || idx}>
                <div
                  onClick={() => navigate(`/train/${session.id}`)}
                  className={cn(
                    'w-16 h-20 rounded border-2 flex flex-col items-center justify-center gap-0.5',
                    'cursor-pointer transition-all hover:scale-105 hover:shadow-md hover:z-10 relative shrink-0',
                    cfg.bg
                  )}
                  title={`Coach ${coachNum} — ${st}`}
                >
                  <span className={cn('text-[9px] font-black uppercase leading-none', cfg.text)}>{coachNum}</span>
                  {cfg.icon}

                  {/* Defect badge */}
                  {hasCritical && (
                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[7px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow">
                      {coach.critical_defects}
                    </span>
                  )}
                  {!hasCritical && hasMissing && (
                    <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white text-[7px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow">
                      !
                    </span>
                  )}
                </div>

                {idx < displayCoaches.length - 1 && <Coupler />}
              </React.Fragment>
            );
          })}

          <div className="ml-3 flex items-center text-[8px] font-bold text-muted-foreground uppercase">END</div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[9px] font-bold text-muted-foreground">
        {Object.entries({
          pending:    'Pending',
          processing: 'Processing',
          clean:      'Clean',
          warning:    'Missing Parts',
          critical:   'Critical Defect',
        }).map(([key, label]) => (
          <span key={key} className="flex items-center gap-1">
            <span className={cn('w-2.5 h-2.5 rounded-sm border', STATUS[key].bg.split(' ').filter(c => c.startsWith('bg-') || c.startsWith('border-')).join(' '))} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
};
