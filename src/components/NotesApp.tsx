'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileUp, Loader2 } from 'lucide-react';
import { createNote, flushSaves, hasUnsavedChanges, importJoplin, init, notify, syncHost, useNotes } from '@/store/notes';
import { initSync } from '@/lib/sync';
import { plural } from '@/lib/format';
import { Sidebar } from './Sidebar';
import { NoteList } from './NoteList';
import { NoteEditorPane } from './editor/NoteEditor';
import { SettingsDialog } from './SettingsDialog';
import { Toasts } from './Toasts';
import { DialogHost } from './ui/dialogs';

/**
 * Drei Bereiche: Navigation · Notizenliste · Editor.
 * Ab 1024 px alle nebeneinander, ab 768 px Liste + Editor (Navigation als Schublade),
 * darunter jeweils ein Bereich mit Zurück-Navigation.
 */
export default function NotesApp() {
  const ready = useNotes(s => s.ready);
  const loadError = useNotes(s => s.loadError);
  const [drawer, setDrawer] = useState(false);
  const [mobilePane, setMobilePane] = useState<'list' | 'editor'>('list');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void init().then(() => {
      if (!useNotes.getState().loadError)
        initSync(syncHost, n => notify(`${plural(n, 'Änderung', 'Änderungen')} von einem anderen Gerät übernommen.`));
    });
  }, []);

  const newNote = useCallback(() => {
    createNote();
    setDrawer(false);
    setMobilePane('editor');
    // Titel fokussieren, sobald der Editor steht
    setTimeout(() => document.getElementById('note-title')?.focus(), 50);
  }, []);

  const focusSearch = useCallback(() => {
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('[data-search]'));
    const visible = inputs.find(i => i.offsetParent !== null);
    if (visible) visible.focus();
    else {
      setMobilePane('list');
      setTimeout(() => Array.from(document.querySelectorAll<HTMLInputElement>('[data-search]')).find(i => i.offsetParent !== null)?.focus(), 50);
    }
  }, []);

  const runImport = useCallback(async (file: File | undefined) => {
    if (!file) return;
    if (!/\.jex$/i.test(file.name) && !(await looksLikeJex(file))) {
      notify('Bitte eine .jex-Datei aus Joplin wählen (Datei → Exportieren → JEX).', 'error');
      return;
    }
    setImportMsg('Datei wird gelesen …');
    try {
      const s = await importJoplin(file, setImportMsg);
      const parts = [plural(s.notes, 'Notiz', 'Notizen'), plural(s.notebooks, 'Notizbuch', 'Notizbücher'), plural(s.tags, 'Schlagwort', 'Schlagwörter'), plural(s.attachments, 'Anhang', 'Anhänge')];
      let msg = `Import abgeschlossen: ${parts.join(', ')}.`;
      if (s.trashed) msg += ` ${s.trashed} davon im Papierkorb.`;
      if (s.skippedEncrypted) msg += ` ${s.skippedEncrypted} verschlüsselte Einträge übersprungen.`;
      if (s.missingAttachments) msg += ` ${s.missingAttachments} Bilder fehlten im Export.`;
      notify(msg);
      setMobilePane('list');
    } catch (e) {
      console.error(e);
      notify(e instanceof Error ? e.message : 'Der Import ist fehlgeschlagen.', 'error');
    } finally {
      setImportMsg(null);
    }
  }, []);

  // Tastenkürzel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[role=dialog]')) return;
      const target = e.target as HTMLElement;
      const typing = target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if (e.altKey && !e.metaKey && !e.ctrlKey && e.code === 'KeyN') {
        e.preventDefault();
        newNote();
      } else if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        focusSearch();
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        focusSearch();
      } else if (e.key === 'Escape' && drawer) {
        setDrawer(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newNote, focusSearch, drawer]);

  // Kein Datenverlust beim Schließen/Verlassen der Seite
  useEffect(() => {
    const onHide = () => void flushSaves();
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges()) return;
      void flushSaves();
      e.preventDefault();
      e.returnValue = '';
    };
    const onVisibility = () => document.visibilityState === 'hidden' && onHide();
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  if (!ready) {
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-muted" role="status" data-loading>
        Notizen werden geladen …
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-dvh items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-line bg-surface p-6 text-center shadow-sm" role="alert">
          <h1 className="text-lg font-semibold">Notizen können nicht geladen werden</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">{loadError}</p>
          <button className="btn-primary mt-5" onClick={() => location.reload()}>
            Neu laden
          </button>
        </div>
      </div>
    );
  }

  const sidebar = (onClose?: () => void) => (
    <Sidebar
      onNavigate={() => {
        setDrawer(false);
        setMobilePane('list');
      }}
      onNewNote={newNote}
      onOpenSettings={() => {
        setDrawer(false);
        setSettingsOpen(true);
      }}
      onClose={onClose}
    />
  );

  return (
    <div
      className="flex h-dvh overflow-hidden"
      onDragOver={e => {
        if (Array.from(e.dataTransfer.types).includes('Files') && !(e.target as HTMLElement).closest('.note-content')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={e => {
        if (!e.relatedTarget) setDragging(false);
      }}
      onDrop={e => {
        setDragging(false);
        if ((e.target as HTMLElement).closest('.note-content')) return;
        const file = Array.from(e.dataTransfer.files).find(f => /\.jex$/i.test(f.name));
        e.preventDefault();
        if (file) void runImport(file);
        else if (e.dataTransfer.files.length) notify('Hier kannst du .jex-Dateien aus Joplin ablegen. Bilder bitte direkt in eine Notiz ziehen.', 'error');
      }}
    >
      <a href="#main-list" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[70] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Zur Notizenliste springen
      </a>

      {/* Navigation: fest ab lg, sonst Schublade */}
      <aside className="hidden w-64 shrink-0 border-r border-line lg:block">{sidebar()}</aside>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-[min(20rem,86vw)] border-r border-line bg-canvas shadow-2xl" aria-label="Navigation">
            {sidebar(() => setDrawer(false))}
          </aside>
        </div>
      )}

      <div id="main-list" className={`w-full shrink-0 border-r border-line md:block md:w-[320px] xl:w-[360px] ${mobilePane === 'list' ? 'block' : 'hidden'}`}>
        <NoteList onOpenNav={() => setDrawer(true)} onOpened={() => setMobilePane('editor')} onNewNote={newNote} onImport={() => fileInput.current?.click()} />
      </div>

      <main className={`min-w-0 flex-1 md:block ${mobilePane === 'editor' ? 'block' : 'hidden'}`}>
        <NoteEditorPane onBack={() => setMobilePane('list')} />
      </main>

      <input
        ref={fileInput}
        type="file"
        hidden
        onChange={e => {
          void runImport(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} onImport={() => fileInput.current?.click()} />}

      {dragging && (
        <div className="pointer-events-none fixed inset-3 z-50 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-accent-soft/80 text-base font-medium text-accent-strong">
          <FileUp className="mr-2" /> Joplin-Export (.jex) hier ablegen
        </div>
      )}

      {importMsg && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/40 p-6" role="alertdialog" aria-modal="true" aria-label="Import läuft">
          <div className="flex min-w-[18rem] items-center gap-3 rounded-2xl bg-surface px-6 py-5 text-sm shadow-2xl">
            <Loader2 className="animate-spin text-accent" size={22} />
            <div>
              <p className="font-semibold">Joplin-Import läuft</p>
              <p className="text-muted" aria-live="polite">
                {importMsg}
              </p>
            </div>
          </div>
        </div>
      )}

      <DialogHost />
      <Toasts />
    </div>
  );
}

async function looksLikeJex(file: File) {
  const head = new Uint8Array(await file.slice(257, 262).arrayBuffer());
  return new TextDecoder().decode(head) === 'ustar';
}
