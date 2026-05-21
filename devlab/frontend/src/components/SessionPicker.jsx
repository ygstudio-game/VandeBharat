import { useEffect, useState } from 'react';

export default function SessionPicker({ value, onChange }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dev/sessions')
      .then((r) => r.json())
      .then((data) => {
        setSessions(data);
        if (!value && data.length > 0) onChange(data[0]);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-xs text-gray-500">Loading sessions…</p>;

  return (
    <div className="flex items-center gap-3">
      <label className="text-xs text-gray-400 shrink-0">Train / Session</label>
      <select
        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
        value={value?.id ?? ''}
        onChange={(e) => {
          const s = sessions.find((s) => s.id === e.target.value);
          if (s) onChange(s);
        }}
      >
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.train_number} — {s.session_code ?? s.id.slice(0, 8)} ({s.status})
          </option>
        ))}
      </select>
      {value && (
        <span className="text-xs text-gray-500">
          {value.total_frames ?? '?'} frames · {value.total_coaches ?? '?'} coaches
        </span>
      )}
    </div>
  );
}
