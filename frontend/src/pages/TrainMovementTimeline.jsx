import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Play, Pause, ChevronLeft, ChevronRight,
  Gauge, Train, Clock, AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getTimeline, getSession } from '../lib/api';

function coachColor(health) {
  if (health === null || health === undefined) return '#94a3b8';
  if (health >= 0.8) return '#10b981';
  if (health >= 0.5) return '#f59e0b';
  return '#ef4444';
}

function coachBgClass(health) {
  if (health === null || health === undefined) return 'bg-slate-100 text-slate-600 border-slate-200';
  if (health >= 0.8) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (health >= 0.5) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-red-50 text-red-700 border-red-200';
}

export function TrainMovementTimeline() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [events, setEvents] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [playbackIndex, setPlaybackIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const intervalRef = useRef(null);
  const svgRef = useRef(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [tl, sess] = await Promise.all([
          getTimeline(sessionId),
          getSession(sessionId),
        ]);
        setEvents(tl.events || []);
        setCoaches(tl.coaches || []);
        setSession(sess);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [sessionId]);

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setPlaybackIndex(i => {
          const next = i + 1;
          if (next >= events.length) {
            setIsPlaying(false);
            return i;
          }
          return next;
        });
      }, speed === 2 ? 500 : 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isPlaying, speed, events.length]);

  useEffect(() => {
    if (playbackIndex >= 0 && playbackIndex < events.length) {
      setSelectedEvent(events[playbackIndex]);
    }
  }, [playbackIndex, events]);

  const handlePlay = useCallback(() => {
    if (playbackIndex >= events.length - 1) setPlaybackIndex(0);
    setIsPlaying(p => !p);
  }, [playbackIndex, events.length]);

  const handleStepBack = useCallback(() => {
    setIsPlaying(false);
    setPlaybackIndex(i => Math.max(0, i - 1));
  }, []);

  const handleStepForward = useCallback(() => {
    setIsPlaying(false);
    setPlaybackIndex(i => Math.min(events.length - 1, i + 1));
  }, [events.length]);

  // SVG layout constants
  const SVG_HEIGHT = 130;
  const COACH_ROW_Y = 28;
  const COACH_H = 46;
  const EVENT_ROW_Y = COACH_ROW_Y + COACH_H + 14;
  const PADDING_X = 48;

  // Use frame.trigger_id if available, fall back to timestamp_ms for x-axis positioning
  function eventX(ev) {
    return ev.frame?.trigger_id ?? ev.timestamp_ms ?? null;
  }

  const allXValues = [
    ...coaches.flatMap(c => [c.start_trigger_id, c.end_trigger_id]).filter(v => v != null),
    ...events.map(eventX).filter(v => v != null),
  ];
  const minTrig = allXValues.length ? Math.min(...allXValues) : 0;
  const maxTrig = allXValues.length ? Math.max(...allXValues) : 100;
  const trigRange = maxTrig - minTrig || 1;

  const SVG_CONTENT_WIDTH = Math.max(800, coaches.length * 110);
  const SVG_TOTAL_WIDTH = SVG_CONTENT_WIDTH + PADDING_X * 2;

  function trigToX(trig) {
    return PADDING_X + ((trig - minTrig) / trigRange) * SVG_CONTENT_WIDTH;
  }

  const currentEvent = playbackIndex >= 0 && playbackIndex < events.length ? events[playbackIndex] : null;
  const currentTrig = currentEvent ? eventX(currentEvent) : null;

  const hasData = coaches.length > 0 || events.length > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-500">Loading timeline…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-2">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
          <p className="text-sm text-red-500">{error}</p>
          <button onClick={() => navigate(-1)} className="text-xs text-blue-500 underline">Go back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0 shadow-sm">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <div className="w-px h-4 bg-border" />
        <Train className="w-4 h-4 text-blue-500" />
        <div>
          <h1 className="text-sm font-bold text-slate-800 leading-tight">Train Movement Timeline</h1>
          {session && (
            <p className="text-[10px] text-slate-400">
              Session {sessionId.slice(0, 8)}… · {coaches.length} coaches · {events.length} events
            </p>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            <Clock className="w-2.5 h-2.5 mr-1" />
            {session?.status || 'unknown'}
          </Badge>
        </div>
      </div>

      {/* ── Main ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: timeline + controls */}
        <div className="flex-1 flex flex-col overflow-hidden p-4 gap-3 min-w-0">

          {/* Playback controls */}
          <Card className="shrink-0">
            <CardContent className="py-2 px-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleStepBack}
                  disabled={playbackIndex <= 0}
                  className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors"
                  title="Step back"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={handlePlay}
                  disabled={events.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white rounded text-xs font-medium hover:bg-blue-600 disabled:opacity-40 transition-colors"
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {isPlaying ? 'Pause' : 'Play'}
                </button>
                <button
                  onClick={handleStepForward}
                  disabled={playbackIndex >= events.length - 1}
                  className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors"
                  title="Step forward"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-border" />
                <div className="flex items-center gap-1.5">
                  <Gauge className="w-3 h-3 text-slate-400" />
                  <span className="text-[10px] text-slate-500">Speed:</span>
                  {[1, 2].map(s => (
                    <button
                      key={s}
                      onClick={() => setSpeed(s)}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                        speed === s ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      {s}×
                    </button>
                  ))}
                </div>
                <div className="ml-auto text-[10px] text-slate-400">
                  {playbackIndex >= 0
                    ? `Event ${playbackIndex + 1} / ${events.length}`
                    : `${events.length} events`}
                </div>
              </div>
              {events.length > 0 && (
                <div className="mt-2 w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-400 rounded-full transition-all duration-300"
                    style={{ width: `${events.length > 1 ? ((playbackIndex + 1) / events.length) * 100 : 0}%` }}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* SVG Timeline */}
          <Card className="flex-1 overflow-hidden flex flex-col">
            <CardHeader className="py-2 px-3 border-b border-border shrink-0">
              <CardTitle className="text-xs font-semibold text-slate-600 flex items-center gap-2">
                <span>Inspection Timeline</span>
                <span className="text-[10px] text-slate-400 font-normal">· scroll right for long trains</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 flex-1 overflow-auto">
              {!hasData ? (
                <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
                  No timeline data available for this session
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <svg ref={svgRef} width={SVG_TOTAL_WIDTH} height={SVG_HEIGHT}>
                    {/* Coach segments */}
                    {coaches.map((coach, idx) => {
                      const segW = SVG_CONTENT_WIDTH / Math.max(coaches.length, 1);
                      const x1 = coach.start_trigger_id != null
                        ? trigToX(coach.start_trigger_id)
                        : PADDING_X + idx * segW;
                      const x2 = coach.end_trigger_id != null
                        ? trigToX(coach.end_trigger_id)
                        : x1 + segW - 2;
                      const w = Math.max(x2 - x1, 42);
                      const color = coachColor(coach.health_score);
                      return (
                        <g key={coach.id}>
                          <rect
                            x={x1} y={COACH_ROW_Y} width={w} height={COACH_H}
                            rx={4}
                            fill={color} fillOpacity={0.12}
                            stroke={color} strokeWidth={1.5}
                          />
                          <text
                            x={x1 + w / 2} y={COACH_ROW_Y + COACH_H / 2 - 5}
                            textAnchor="middle" fontSize={9} fontWeight="700" fill={color}
                          >
                            {coach.coach_number || `C${idx + 1}`}
                          </text>
                          {coach.health_score != null && (
                            <text
                              x={x1 + w / 2} y={COACH_ROW_Y + COACH_H / 2 + 9}
                              textAnchor="middle" fontSize={8} fill={color} opacity={0.85}
                            >
                              {Math.round(coach.health_score * 100)}%
                            </text>
                          )}
                        </g>
                      );
                    })}

                    {/* Event markers */}
                    {events.map((ev, idx) => {
                      const trig = eventX(ev);
                      if (trig == null) return null;
                      const x = trigToX(trig);
                      const isSelected = selectedEvent?.id === ev.id;
                      const isGap = ev.event_type === 'COACH_GAP' || ev.event_type === 'GAP_BOUNDARY';
                      const isOcr = ev.event_type === 'OCR_ANCHOR';

                      if (isGap) {
                        return (
                          <line
                            key={ev.id}
                            x1={x} y1={COACH_ROW_Y - 4}
                            x2={x} y2={COACH_ROW_Y + COACH_H + 4}
                            stroke="#64748b" strokeWidth={1} strokeDasharray="3,2"
                          />
                        );
                      }

                      return (
                        <g
                          key={ev.id}
                          style={{ cursor: 'pointer' }}
                          onClick={() => { setSelectedEvent(ev); setPlaybackIndex(idx); }}
                        >
                          {isOcr ? (
                            <polygon
                              points={`${x},${EVENT_ROW_Y - 7} ${x + 6},${EVENT_ROW_Y} ${x},${EVENT_ROW_Y + 7} ${x - 6},${EVENT_ROW_Y}`}
                              fill={isSelected ? '#2563eb' : '#60a5fa'}
                              stroke={isSelected ? '#1d4ed8' : '#93c5fd'}
                              strokeWidth={isSelected ? 1.5 : 1}
                            />
                          ) : (
                            <circle
                              cx={x} cy={EVENT_ROW_Y}
                              r={isSelected ? 5.5 : 4}
                              fill={isSelected ? '#7c3aed' : '#a78bfa'}
                              stroke={isSelected ? '#5b21b6' : '#c4b5fd'}
                              strokeWidth={isSelected ? 1.5 : 1}
                            />
                          )}
                        </g>
                      );
                    })}

                    {/* Playback cursor */}
                    {currentTrig != null && (
                      <line
                        x1={trigToX(currentTrig)} y1={COACH_ROW_Y - 10}
                        x2={trigToX(currentTrig)} y2={EVENT_ROW_Y + 12}
                        stroke="#f97316" strokeWidth={2} strokeDasharray="4,2"
                      />
                    )}

                    {/* X-axis range labels */}
                    <text x={PADDING_X} y={SVG_HEIGHT - 4} fontSize={8} fill="#94a3b8">
                      T:{minTrig}
                    </text>
                    <text x={SVG_TOTAL_WIDTH - PADDING_X} y={SVG_HEIGHT - 4} fontSize={8} fill="#94a3b8" textAnchor="end">
                      T:{maxTrig}
                    </text>
                  </svg>
                </div>
              )}

              {/* Legend */}
              <div className="mt-3 flex items-center gap-4 flex-wrap border-t border-border pt-2">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-emerald-500 opacity-40 border border-emerald-500" />
                  <span className="text-[10px] text-slate-500">Healthy ≥80%</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-amber-500 opacity-40 border border-amber-500" />
                  <span className="text-[10px] text-slate-500">Warning 50–79%</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-red-500 opacity-40 border border-red-500" />
                  <span className="text-[10px] text-slate-500">Critical &lt;50%</span>
                </div>
                <div className="flex items-center gap-1">
                  <svg width="13" height="13"><polygon points="6.5,0 12,6.5 6.5,13 1,6.5" fill="#60a5fa" /></svg>
                  <span className="text-[10px] text-slate-500">Coach Number Anchor</span>
                </div>
                <div className="flex items-center gap-1">
                  <svg width="13" height="13">
                    <line x1="6" y1="0" x2="6" y2="13" stroke="#64748b" strokeWidth="1.5" strokeDasharray="3,2" />
                  </svg>
                  <span className="text-[10px] text-slate-500">Coach Gap</span>
                </div>
                <div className="flex items-center gap-1">
                  <svg width="13" height="13">
                    <line x1="6" y1="0" x2="6" y2="13" stroke="#f97316" strokeWidth="2" strokeDasharray="4,2" />
                  </svg>
                  <span className="text-[10px] text-slate-500">Playback cursor</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Coach chips */}
          {coaches.length > 0 && (
            <Card className="shrink-0">
              <CardHeader className="py-2 px-3 border-b border-border">
                <CardTitle className="text-xs font-semibold text-slate-600">
                  Coaches ({coaches.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                <div className="flex gap-1.5 flex-wrap">
                  {coaches.map(c => (
                    <div
                      key={c.id}
                      className={`px-2 py-1 rounded text-[10px] font-medium border ${coachBgClass(c.health_score)}`}
                    >
                      {c.coach_number || `Coach ${c.coach_index ?? '?'}`}
                      {c.health_score != null && (
                        <span className="ml-1 opacity-60">{Math.round(c.health_score * 100)}%</span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: event detail panel */}
        <div className="w-72 shrink-0 border-l border-border bg-card flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-border">
            <h2 className="text-xs font-semibold text-slate-600">Event Detail</h2>
          </div>
          {selectedEvent ? (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {selectedEvent.frame?.cloudinary_url && (
                <div className="rounded overflow-hidden border border-border bg-slate-900">
                  <img
                    src={selectedEvent.frame.cloudinary_url}
                    alt="Frame"
                    className="w-full object-contain"
                    style={{ maxHeight: 180 }}
                  />
                </div>
              )}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">Event Type</span>
                  <Badge variant="outline" className="text-[10px]">{selectedEvent.event_type}</Badge>
                </div>
                {selectedEvent.coach && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">Coach</span>
                    <span className="text-[10px] font-medium text-slate-700">
                      {selectedEvent.coach.coach_number}
                    </span>
                  </div>
                )}
                {selectedEvent.frame?.trigger_id != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">Trigger ID</span>
                    <span className="text-[10px] font-mono text-slate-600">
                      {selectedEvent.frame.trigger_id}
                    </span>
                  </div>
                )}
                {selectedEvent.timestamp_ms != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">Timestamp</span>
                    <span className="text-[10px] font-mono text-slate-600">
                      {selectedEvent.timestamp_ms}ms
                    </span>
                  </div>
                )}
                {selectedEvent.description && (
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-1">Description</span>
                    <p className="text-[10px] text-slate-600 bg-slate-50 rounded p-1.5">
                      {selectedEvent.description}
                    </p>
                  </div>
                )}
                {selectedEvent.metadata && (
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-1">Metadata</span>
                    <pre className="text-[9px] text-slate-500 bg-slate-50 rounded p-1.5 overflow-x-auto whitespace-pre-wrap">
                      {JSON.stringify(selectedEvent.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-4">
              <p className="text-[11px] text-slate-400 text-center leading-relaxed">
                Click an event on the timeline<br />to view frame details
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
