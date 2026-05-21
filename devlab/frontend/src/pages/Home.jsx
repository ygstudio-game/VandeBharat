import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanText, RefreshCw, Cpu } from 'lucide-react';

export default function HomePage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/dev/sessions')
      .then((r) => r.json())
      .then(setSessions)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-lg font-semibold text-amber-400 mb-1">DevLab</h1>
      <p className="text-xs text-gray-500 mb-6">
        Select a session and jump to a tester to re-run individual pipeline stages.
      </p>

      {loading && <p className="text-xs text-gray-600">Loading…</p>}

      <div className="space-y-2">
        {sessions.map((s) => (
          <div
            key={s.id}
            className="border border-gray-800 rounded-lg p-4 bg-gray-900 flex items-center justify-between"
          >
            <div>
              <p className="text-sm font-medium text-gray-100">
                {s.train_number}
                <span className="ml-2 text-xs text-gray-500">{s.session_code}</span>
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                {s.total_frames ?? '?'} frames · {s.total_coaches ?? '?'} coaches ·{' '}
                <span
                  className={
                    s.status === 'completed'
                      ? 'text-green-400'
                      : s.status === 'failed'
                      ? 'text-red-400'
                      : 'text-yellow-400'
                  }
                >
                  {s.status}
                </span>
              </p>
              <p className="text-xs text-gray-700 mt-0.5">
                OCR conf: {s.ocr_confidence ?? '—'} · Sync conf: {s.sync_confidence ?? '—'}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => navigate(`/ocr?session=${s.id}`)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-800 hover:bg-blue-900 border border-gray-700 rounded transition-colors"
              >
                <ScanText size={12} /> OCR
              </button>
              <button
                onClick={() => navigate(`/sync?session=${s.id}`)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-800 hover:bg-purple-900 border border-gray-700 rounded transition-colors"
              >
                <RefreshCw size={12} /> Sync
              </button>
              <button
                onClick={() => navigate(`/components?session=${s.id}`)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-800 hover:bg-green-900 border border-gray-700 rounded transition-colors"
              >
                <Cpu size={12} /> Components
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
