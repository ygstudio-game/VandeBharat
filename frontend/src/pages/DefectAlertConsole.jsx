import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DefectPreviewModal } from '../components/dashboard/DefectPreviewModal';
import { usePolling } from '../hooks/usePolling';
import { useSessionSocket } from '../hooks/useSessionSocket';
import { toast } from '../hooks/useToast';
import { getRecentDefects } from '../lib/api';
import DetectionLogTable from '../components/DetectionLogTable';
import { exportToCSV, exportToJSON } from '../lib/export';
import { Download } from 'lucide-react';

export const DefectAlertConsole = () => {
  const navigate = useNavigate();
  const { data: defectsData, refresh: refreshDefects } = usePolling(getRecentDefects, 15000);
  const [previewDefect, setPreviewDefect] = useState(null);

  const defectRows = (defectsData?.defects || []).map((d) => {
    const timestamp = d.session_started_at && d.captured_at_ms != null
      ? new Date(new Date(d.session_started_at).getTime() + d.captured_at_ms).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'medium',
        })
      : '—';
    return {
      id: d.id,
      imageId: d.sequence_number != null ? `IMG-${d.sequence_number}` : '—',
      timestamp,
      location: d.station_name || '—',
      trainNo: d.train_number || '—',
      bogieNo: d.coach_number || '—',
      cameraId: d.camera_name || d.camera_type || '—',
      component: '—',
      defect: d.defect_type,
      hasDefect: true,
      severity: d.severity,
      detectionCount: 0,
      sessionId: d.session_id,
      frame: {
        defect_type: d.defect_type,
        severity: d.severity,
        bbox: d.bbox,
        cloudinary_url: d.cloudinary_url,
        thumbnail_url: d.thumbnail_url,
      },
    };
  });

  const { lastEvent, connected } = useSessionSocket(null);
  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.type === 'defects_found') {
      refreshDefects();
      if (lastEvent.critical > 0) {
        toast.warning(`${lastEvent.count} new defect(s), ${lastEvent.critical} critical.`, 'Defect Alert');
      }
    }
  }, [lastEvent, refreshDefects]);

  const exportRows = defectRows.map((r) => ({
    image_id: r.imageId,
    timestamp: r.timestamp,
    location: r.location,
    train_no: r.trainNo,
    bogie_no: r.bogieNo,
    camera: r.cameraId,
    defect: r.defect,
    severity: r.severity,
  }));

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 font-sans">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">DEFECT ALERT CONSOLE</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Chronological alert feed — coach, defect type, confidence, severity, thumbnail
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs font-bold text-muted-foreground flex items-center gap-2 bg-card border border-border px-3 py-1.5 rounded-full shadow-sm">
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-success animate-pulse' : 'bg-amber-400'}`}></div>
            {connected ? 'LIVE ENGINE SYNCED' : 'POLLING MODE'}
          </div>
          <button
            onClick={() => exportToCSV(exportRows, 'defect_alerts.csv')}
            disabled={!exportRows.length}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 border border-border rounded hover:bg-secondary disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button
            onClick={() => exportToJSON(exportRows, 'defect_alerts.json')}
            disabled={!exportRows.length}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 border border-border rounded hover:bg-secondary disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" /> JSON
          </button>
        </div>
      </div>

      <div className="h-[640px]">
        <DetectionLogTable
          rows={defectRows}
          onViewFrame={(frame) => setPreviewDefect(frame)}
          onGoToReport={(row) => row.sessionId && navigate(`/reports?session=${row.sessionId}`)}
        />
      </div>

      {previewDefect && (
        <DefectPreviewModal defect={previewDefect} onClose={() => setPreviewDefect(null)} />
      )}
    </div>
  );
};
