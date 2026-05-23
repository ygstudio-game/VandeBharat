import React, { useState } from 'react';
import { 
  Train, 
  ChevronRight, 
  ChevronDown, 
  FileText, 
  AlertTriangle, 
  ShieldAlert, 
  Camera, 
  Image as ImageIcon,
  CheckCircle,
  Eye,
  Cpu
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from '@/lib/utils';

// Kept only as a shape reference — never rendered; real data comes from the API hierarchy endpoint
const _coachShape = [
  {
    id: "coach-b1",
    coachNumber: "B1",
    stats: {
      ocrFramesCount: 23,
      componentFramesCount: 140,
      criticalDefects: 1,
      missingComponents: 1
    },
    cameras: [
      {
        id: "cam-ocr-01",
        name: "OCR Camera (Front)",
        frames: ["frame-ocr-b1-01.jpg", "frame-ocr-b1-02.jpg"]
      },
      {
        id: "cam-left-01",
        name: "Left Assembly Camera",
        frames: ["frame-left-b1-01.jpg", "frame-left-b1-02.jpg", "frame-left-b1-03.jpg"]
      },
      {
        id: "cam-right-01",
        name: "Right Assembly Camera",
        frames: ["frame-right-b1-01.jpg", "frame-right-b1-02.jpg"]
      }
    ]
  },
  {
    id: "coach-b2",
    coachNumber: "B2",
    stats: {
      ocrFramesCount: 18,
      componentFramesCount: 132,
      criticalDefects: 1,
      missingComponents: 0
    },
    cameras: [
      {
        id: "cam-ocr-02",
        name: "OCR Camera (Front)",
        frames: ["frame-ocr-b2-01.jpg"]
      },
      {
        id: "cam-left-02",
        name: "Left Assembly Camera",
        frames: ["frame-left-b2-01.jpg", "frame-left-b2-02.jpg"]
      }
    ]
  },
  {
    id: "coach-b3",
    coachNumber: "B3",
    stats: {
      ocrFramesCount: 20,
      componentFramesCount: 144,
      criticalDefects: 0,
      missingComponents: 0
    },
    cameras: [
      {
        id: "cam-left-03",
        name: "Left Assembly Camera",
        frames: ["frame-left-b3-01.jpg"]
      }
    ]
  },
  {
    id: "coach-b4",
    coachNumber: "B4",
    stats: {
      ocrFramesCount: 22,
      componentFramesCount: 138,
      criticalDefects: 0,
      missingComponents: 0
    },
    cameras: [
      {
        id: "cam-left-04",
        name: "Left Assembly Camera",
        frames: ["frame-left-b4-01.jpg"]
      }
    ]
  }
];

// Map an API coach object (snake_case) to the internal tree node shape
function normalizeCoach(c) {
  return {
    id: c.id,
    coachNumber: c.coach_number,
    stats: {
      ocrFramesCount: c.ocr_frame_count || 0,
      componentFramesCount: c.total_frames || 0,
      criticalDefects: c.critical_defects || 0,
      missingComponents: c.missing_components_count || 0,
    },
    cameras: [],
  };
}

export const HierarchyTree = ({ onSelectNode, coaches: coachesProp, trainNumber, sessionId }) => {
  const coaches = (coachesProp || []).map(normalizeCoach);
  const firstCoachId = coaches[0]?.id || 'coach-b1';
  const [openCoaches, setOpenCoaches] = useState(() => ({ [firstCoachId]: true }));
  const [openSubnodes, setOpenSubnodes] = useState({});
  const [selectedId, setSelectedId] = useState('train-root');

  const toggleCoach = (id) => {
    setOpenCoaches(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleSubnode = (id) => {
    setOpenSubnodes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSelect = (nodeType, nodeId, metadata) => {
    setSelectedId(nodeId);
    if (onSelectNode) {
      onSelectNode(nodeType, nodeId, metadata);
    }
  };

  return (
    <div className="flex flex-col h-full bg-card border border-border rounded-lg shadow-sm font-mono text-xs overflow-hidden">
      {/* Train Root Header */}
      <div 
        onClick={() => handleSelect('train', 'train-root')}
        className={cn(
          "p-4 border-b border-border flex items-center justify-between cursor-pointer transition-colors duration-200",
          selectedId === 'train-root' ? "bg-primary text-primary-foreground" : "bg-slate-50/50 hover:bg-slate-50 text-foreground"
        )}
      >
        <div className="flex items-center gap-2.5">
          <Train className={cn("w-4.5 h-4.5", selectedId === 'train-root' ? "text-primary-foreground" : "text-primary")} />
          <div>
            <p className="font-extrabold leading-none">{trainNumber || 'VB-—'}</p>
            <p className={cn("text-[9px] font-bold mt-1", selectedId === 'train-root' ? "text-primary-foreground/75" : "text-muted-foreground")}>
              SESSION: {sessionId || '—'}
            </p>
          </div>
        </div>
        <Badge variant={selectedId === 'train-root' ? 'secondary' : 'default'} className="font-mono text-[9px] font-bold">
          {coaches.length} BOGIES
        </Badge>
      </div>

      {/* Hierarchical Scroll Area */}
      <ScrollArea className="flex-1 p-2">
        <div className="space-y-1">
          {coaches.map((coach) => {
            const isCoachOpen = openCoaches[coach.id];
            const hasCritical = coach.stats.criticalDefects > 0;
            const hasMissing = coach.stats.missingComponents > 0;

            return (
              <div key={coach.id} className="space-y-0.5">
                {/* Coach Header Node */}
                <div 
                  className={cn(
                    "flex items-center justify-between p-2 rounded-md transition-all duration-200 cursor-pointer group",
                    selectedId === coach.id 
                      ? "bg-slate-900 text-white font-bold" 
                      : "hover:bg-secondary/70 text-slate-700"
                  )}
                  onClick={() => handleSelect('coach', coach.id, coach)}
                >
                  <div className="flex items-center gap-2 w-full">
                    {/* Collapsible toggle */}
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCoach(coach.id);
                      }}
                      className="p-0.5 hover:bg-slate-200/50 rounded text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {isCoachOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                    <span className="font-extrabold tracking-wide">Bogie {coach.coachNumber}</span>
                  </div>

                  {/* Badges indicators */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {hasCritical && (
                      <Badge variant="destructive" className="h-4 px-1 text-[8px] font-black rounded flex items-center gap-0.5 shadow-sm animate-pulse">
                        <ShieldAlert className="w-2.5 h-2.5" />
                        {coach.stats.criticalDefects}
                      </Badge>
                    )}
                    {hasMissing && (
                      <Badge variant="outline" className="h-4 px-1 text-[8px] font-black rounded border-warning text-warning bg-warning/5 flex items-center gap-0.5">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        {coach.stats.missingComponents}
                      </Badge>
                    )}
                    {!hasCritical && !hasMissing && (
                      <CheckCircle className="w-3.5 h-3.5 text-success shrink-0" />
                    )}
                  </div>
                </div>

                {/* Coach Subtree */}
                {isCoachOpen && (
                  <div className="pl-6 border-l border-dashed border-border ml-3.5 space-y-0.5 pt-0.5 pb-1">
                    {/* OCR Frames subnode */}
                    <div 
                      onClick={() => handleSelect('ocr', `${coach.id}-ocr`, { coachId: coach.id, coachNumber: coach.coachNumber })}
                      className={cn(
                        "flex items-center justify-between p-1.5 rounded cursor-pointer transition-colors text-[11px]",
                        selectedId === `${coach.id}-ocr` ? "bg-primary/5 text-primary font-bold border-l-2 border-primary" : "text-muted-foreground hover:text-foreground hover:bg-slate-100/50"
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5" /> OCR Anchors
                      </span>
                      <span className="text-[10px] font-bold">({coach.stats.ocrFramesCount})</span>
                    </div>

                    {/* Component Frames subnode */}
                    <div
                      onClick={() => handleSelect('components', `${coach.id}-components`, { coachId: coach.id, coachNumber: coach.coachNumber })}
                      className={cn(
                        "flex items-center justify-between p-1.5 rounded cursor-pointer transition-colors text-[11px]",
                        selectedId === `${coach.id}-components` ? "bg-primary/5 text-primary font-bold border-l-2 border-primary" : "text-muted-foreground hover:text-foreground hover:bg-slate-100/50"
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5" /> Component Frames
                      </span>
                      <span className="text-[10px] font-bold">({coach.stats.componentFramesCount})</span>
                    </div>

                    {/* Cameras Collapsible Group */}
                    <Collapsible
                      open={openSubnodes[`${coach.id}-cams`]}
                      onOpenChange={() => toggleSubnode(`${coach.id}-cams`)}
                      className="space-y-0.5"
                    >
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center justify-between p-1.5 rounded cursor-pointer text-muted-foreground hover:text-foreground hover:bg-slate-100/50 text-[11px]">
                          <span className="flex items-center gap-1.5">
                            <Camera className="w-3.5 h-3.5" /> Camera Feeds
                          </span>
                          {openSubnodes[`${coach.id}-cams`] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pl-4 space-y-0.5 border-l border-dotted border-border/80 ml-2">
                        {coach.cameras.map((cam) => (
                          <div 
                            key={cam.id}
                            onClick={() => handleSelect('camera-feed', `${coach.id}-${cam.id}`, cam)}
                            className={cn(
                              "flex items-center justify-between p-1.5 rounded cursor-pointer transition-colors text-[10px] font-bold",
                              selectedId === `${coach.id}-${cam.id}` ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-slate-100/30"
                            )}
                          >
                            <span className="truncate max-w-[130px] flex items-center gap-1">
                              <Eye className="w-3 h-3 text-muted-foreground/80" />
                              {cam.name}
                            </span>
                            <span className="text-[9px] opacity-75">({cam.frames.length})</span>
                          </div>
                        ))}
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Tree footer stats */}
      <div className="p-3 border-t border-border bg-slate-50/50 space-y-1 text-[10px] font-bold text-muted-foreground">
        <div className="flex justify-between">
          <span>COACHES_LOADED:</span>
          <span className="text-foreground">{coaches.length}</span>
        </div>
        <div className="flex justify-between">
          <span>TOTAL_FRAMES:</span>
          <span className="text-foreground">
            {coaches.reduce((s, c) => s + (c.stats?.componentFramesCount || 0), 0)}
          </span>
        </div>
      </div>
    </div>
  );
};
