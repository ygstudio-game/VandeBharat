export default function ResultPanel({ title, data, error }) {
  if (error) {
    return (
      <div className="rounded border border-red-800 bg-red-950/40 p-3">
        <p className="text-xs text-red-400 font-semibold mb-1">{title} — Error</p>
        <pre className="text-xs text-red-300 whitespace-pre-wrap break-all">
          {typeof error === 'string' ? error : JSON.stringify(error, null, 2)}
        </pre>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="rounded border border-gray-700 bg-gray-900 p-3">
      <p className="text-xs text-gray-400 font-semibold mb-2">{title}</p>
      <pre className="text-xs text-green-300 whitespace-pre-wrap break-all overflow-auto max-h-60">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
