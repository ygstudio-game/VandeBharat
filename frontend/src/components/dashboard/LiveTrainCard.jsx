import React from 'react';
import { ChevronRight, CheckCircle2, Clock, PlayCircle, AlertCircle, ShieldAlert, Cpu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export const LiveTrainCard = ({ session }) => {
  const navigate = useNavigate();

  // Combine component detection and defect analysis into a single step: Component & Defect Detection
  const getComponentDefectStatus = () => {
    const comp = session.pipelineStates.componentDetection;
    const defect = session.pipelineStates.defectAnalysis;

    if (comp === 'COMPLETED' && defect === 'COMPLETED') return 'COMPLETED';
    if (comp === 'FAILED' || defect === 'FAILED') return 'FAILED';
    if (comp === 'IN_PROGRESS' || defect === 'IN_PROGRESS' || comp === 'COMPLETED') return 'IN_PROGRESS';
    return 'PENDING';
  };

  const steps = [
    { label: 'Frame Extraction', state: session.pipelineStates.frameExtraction },
    { label: 'OCR Detection', state: session.pipelineStates.ocrDetection },
    { label: 'Sync & Coach Mapping', state: session.pipelineStates.synchronization },
    { label: 'Component & Defect Detection', state: getComponentDefectStatus() },
    { label: 'Report Generation', state: session.pipelineStates.reportGeneration },
  ];

  const getStatusColor = (status) => {
    switch (status) {
      case 'PROCESSING': return 'bg-processing/10 text-processing border-processing/30';
      case 'COMPLETED': return 'bg-success/10 text-success border-success/30';
      case 'FAILED': return 'bg-destructive/10 text-destructive border-destructive/30';
      case 'REVIEW_READY': return 'bg-warning/10 text-warning border-warning/30';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getStepColorClass = (state) => {
    switch (state) {
      case 'COMPLETED': return {
        bg: 'bg-success border-success text-success-foreground',
        text: 'text-success font-semibold',
        line: 'bg-success'
      };
      case 'IN_PROGRESS': return {
        bg: 'bg-processing border-processing text-processing-foreground animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.5)]',
        text: 'text-processing font-extrabold',
        line: 'bg-slate-200'
      };
      case 'FAILED': return {
        bg: 'bg-destructive border-destructive text-destructive-foreground',
        text: 'text-destructive font-semibold',
        line: 'bg-slate-200'
      };
      default: return {
        bg: 'bg-card border-border text-muted-foreground',
        text: 'text-muted-foreground',
        line: 'bg-slate-200'
      };
    }
  };

  return (
    <Card className="bg-card border border-border shadow-sm overflow-hidden hover:shadow-md hover:border-slate-300 transition-all duration-300">
      <CardContent className="p-6 space-y-6">
        {/* Top Segment: Metadata & Progress */}
        <div className="flex justify-between items-start">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs font-bold text-muted-foreground/60">{session.id}</span>
              <h3 className="text-lg font-black tracking-tight text-foreground flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-primary" />
                {session.trainNumber}
              </h3>
              <Badge variant="outline" className={cn('font-bold text-[10px] tracking-wider uppercase px-2 py-0.5 rounded', getStatusColor(session.status))}>
                {session.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground font-semibold">
              CAPTURE_TIME: {new Date(session.startedAt).toLocaleString()}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black font-mono text-foreground leading-none">{session.progressPercent}%</p>
            <p className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest mt-1">Telemetry Sync</p>
          </div>
        </div>

        {/* 5-Step Progress Tracker */}
        <div className="relative flex items-center justify-between w-full px-2 py-4 bg-slate-50/50 rounded-lg border border-border/50">
          {/* Background line connecting all steps */}
          <div className="absolute left-8 right-8 top-1/2 -translate-y-1/2 h-[3px] bg-slate-200/80 -z-0" />

          {steps.map((step, idx) => {
            const colors = getStepColorClass(step.state);
            const isLast = idx === steps.length - 1;

            return (
              <div key={step.label} className="relative z-10 flex flex-col items-center flex-1">
                {/* Connecting active line */}
                {!isLast && step.state === 'COMPLETED' && (
                  <div className="absolute left-1/2 right-[-50%] top-4 h-[3px] bg-success -z-10" />
                )}
                {/* Connecting processing line */}
                {!isLast && step.state === 'IN_PROGRESS' && (
                  <div className="absolute left-1/2 right-[-50%] top-4 h-[3px] bg-processing/40 -z-10" />
                )}

                {/* Circle Icon Indicator */}
                <div className={cn('w-8 h-8 rounded-full border flex items-center justify-center font-mono text-xs font-black shadow-sm transition-all duration-300', colors.bg)}>
                  {step.state === 'COMPLETED' ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : step.state === 'IN_PROGRESS' ? (
                    <PlayCircle className="w-4 h-4" />
                  ) : step.state === 'FAILED' ? (
                    <AlertCircle className="w-4 h-4" />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>

                {/* Label */}
                <span className={cn('text-[10px] text-center font-extrabold uppercase mt-2 tracking-wider max-w-[100px] leading-tight transition-colors duration-300', colors.text)}>
                  {step.label}
                </span>

                {/* Micro operational messages */}
                {step.state === 'IN_PROGRESS' && (
                  <span className="absolute -bottom-5 text-[9px] font-black text-processing/90 animate-pulse tracking-wide whitespace-nowrap">
                    {step.label === 'Sync & Coach Mapping' ? 'Mapping bogies...' : 'Processing...'}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom Metadata & CTA */}
        <div className="flex items-center justify-between border-t border-border pt-4 text-xs font-bold">
          <div className="flex gap-6 text-muted-foreground font-mono">
            <div>
              <span>BOGIES: </span>
              <span className="text-foreground">{session.stats.totalCoaches}</span>
            </div>
            <div>
              <span>CRIT_DFCTS: </span>
              <span className={cn(session.stats.criticalDefects > 0 ? 'text-destructive font-black animate-pulse' : 'text-success')}>
                {session.stats.criticalDefects}
              </span>
            </div>
            <div>
              <span>OCR_CONF: </span>
              <span className="text-foreground">{(session.stats.ocrConfidence * 100).toFixed(0)}%</span>
            </div>
            <div>
              <span>SYNC_CONF: </span>
              <span className="text-foreground">{(session.stats.synchronizationConfidence * 100).toFixed(0)}%</span>
            </div>
          </div>
          
          <button 
            onClick={() => navigate(`/train/${session.id}`)}
            className="flex items-center gap-1 bg-secondary text-primary hover:bg-primary hover:text-primary-foreground px-3 py-1.5 rounded text-xs font-black tracking-wide uppercase transition-all duration-200 border border-border shadow-sm"
          >
            Open Workspace
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
};
