'use client';

import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { dismissToast, useNotes } from '@/store/notes';

export function Toasts() {
  const toasts = useNotes(s => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] md:bottom-4 flex flex-col items-center gap-2 px-4" aria-live="polite" role="status">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`pointer-events-auto flex max-w-lg items-center gap-3 rounded-xl px-4 py-3 text-sm shadow-xl ${
            t.kind === 'error' ? 'bg-danger text-white dark:text-canvas' : 'bg-ink text-canvas'
          }`}
          role={t.kind === 'error' ? 'alert' : undefined}
        >
          {t.kind === 'error' ? <AlertCircle size={17} className="shrink-0" /> : <CheckCircle2 size={17} className="shrink-0 opacity-80" />}
          <span className="flex-1">{t.message}</span>
          {t.action && (
            <button
              className="rounded-md px-2 py-1 font-semibold underline-offset-2 hover:underline"
              onClick={() => {
                t.action!.run();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button className="rounded-md p-1 opacity-70 hover:opacity-100" onClick={() => dismissToast(t.id)} aria-label="Meldung schließen">
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
