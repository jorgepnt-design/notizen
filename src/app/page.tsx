'use client';

import dynamic from 'next/dynamic';

// Die App lebt komplett im Browser (IndexedDB), daher ohne Server-Rendering laden.
const NotesApp = dynamic(() => import('@/components/NotesApp'), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center text-sm text-muted" role="status" data-loading>
      Notizen werden geladen …
    </div>
  ),
});

export default function Page() {
  return <NotesApp />;
}
