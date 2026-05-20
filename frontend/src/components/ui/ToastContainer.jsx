import React, { useEffect } from 'react';
import { useToastStore } from '../../hooks/useToast';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

const ICONS = {
  success: <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />,
  warning: <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />,
  error:   <XCircle      className="w-4 h-4 text-red-500     shrink-0 mt-0.5" />,
  info:    <Info         className="w-4 h-4 text-blue-500    shrink-0 mt-0.5" />,
};

const BORDER = {
  success: 'border-emerald-200 bg-emerald-50/50',
  warning: 'border-amber-200 bg-amber-50/50',
  error:   'border-red-200 bg-red-50/50',
  info:    'border-blue-200 bg-blue-50/50',
};

function ToastItem({ t }) {
  const remove = useToastStore((s) => s.remove);

  useEffect(() => {
    const timer = setTimeout(() => remove(t.id), 5000);
    return () => clearTimeout(timer);
  }, [t.id, remove]);

  return (
    <div
      className={`flex items-start gap-3 border ${BORDER[t.type] || 'border-border bg-card'} rounded-lg shadow-lg p-4 w-80 font-sans`}
    >
      {ICONS[t.type] || ICONS.info}
      <div className="flex-1 min-w-0">
        {t.title && (
          <p className="text-[10px] font-black text-foreground uppercase tracking-wider mb-0.5">{t.title}</p>
        )}
        <p className="text-xs text-muted-foreground font-medium leading-relaxed">{t.message}</p>
      </div>
      <button
        onClick={() => remove(t.id)}
        className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem t={t} />
        </div>
      ))}
    </div>
  );
}
