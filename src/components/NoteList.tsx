'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownUp, FileUp, Menu as MenuIcon, Pin, Plus, Search, SlidersHorizontal, Star, Trash2, X } from 'lucide-react';
import { emptyTrash, notify, selectNote, setFilters, setQuery, setSort, useNotes } from '@/store/notes';
import { notebookPath, selectNotes } from '@/lib/query';
import { previewText } from '@/lib/html';
import { plural, shortDate } from '@/lib/format';
import type { Id, Note, SortKey } from '@/lib/types';
import { confirmDialog } from './ui/dialogs';
import { DND_NOTE } from './Sidebar';

const STEP = 100;
const SORT_LABEL: Record<SortKey, string> = { updated: 'Zuletzt geändert', created: 'Erstellt', title: 'Titel (A–Z)' };

interface Props {
  onOpenNav: () => void;
  onOpened: () => void;
  onNewNote: () => void;
  onImport: () => void;
}

export function NoteList({ onOpenNav, onOpened, onNewNote, onImport }: Props) {
  const notesById = useNotes(s => s.notes);
  const notebooks = useNotes(s => s.notebooks);
  const tags = useNotes(s => s.tags);
  const view = useNotes(s => s.view);
  const query = useNotes(s => s.query);
  const filters = useNotes(s => s.filters);
  const sort = useNotes(s => s.settings.sort);
  const selectedId = useNotes(s => s.selectedId);
  const [showFilters, setShowFilters] = useState(false);
  const [limit, setLimit] = useState(STEP);
  const listRef = useRef<HTMLUListElement>(null);
  const sentinel = useRef<HTMLLIElement>(null);

  const all = useMemo(() => Object.values(notesById), [notesById]);
  const notes = useMemo(() => selectNotes(all, notebooks, view, query, filters, sort), [all, notebooks, view, query, filters, sort]);
  const totalInView = useMemo(() => selectNotes(all, notebooks, view, '', {}, sort).length, [all, notebooks, view, sort]);
  const isEmptyApp = all.length === 0;
  const activeFilters = (filters.notebookId !== undefined ? 1 : 0) + (filters.tagId ? 1 : 0);

  // Auf großen Bildschirmen immer eine Notiz anzeigen
  useEffect(() => {
    if (!selectedId || !notes.some(n => n.id === selectedId)) {
      if (window.matchMedia('(min-width: 768px)').matches) selectNote(notes[0]?.id ?? null);
      else if (selectedId && !notesById[selectedId]) selectNote(null);
    }
  }, [notes, selectedId, notesById]);

  useEffect(() => {
    setLimit(STEP);
    listRef.current?.scrollTo({ top: 0 });
  }, [view, query, filters, sort]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setLimit(l => l + STEP), { root: listRef.current, rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [notes.length, limit]);

  const title =
    view.type === 'all' ? 'Alle Notizen'
    : view.type === 'favorites' ? 'Favoriten'
    : view.type === 'unsorted' ? 'Unsortiert'
    : view.type === 'trash' ? 'Papierkorb'
    : view.type === 'notebook' ? notebooks[view.id]?.name ?? 'Notizbuch'
    : `# ${tags[view.id]?.name ?? ''}`;

  const open = (id: Id) => {
    selectNote(id);
    onOpened();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = notes.findIndex(n => n.id === selectedId);
    const next = notes[Math.max(0, Math.min(notes.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (!next) return;
    selectNote(next.id);
    listRef.current?.querySelector<HTMLElement>(`[data-note="${next.id}"]`)?.focus();
  };

  const askEmptyTrash = async () => {
    const n = notes.length;
    const ok = await confirmDialog({
      title: 'Papierkorb leeren?',
      message: `${plural(n, 'Notiz wird', 'Notizen werden')} endgültig gelöscht. Das lässt sich nicht rückgängig machen.`,
      confirmLabel: 'Endgültig löschen',
      danger: true,
    });
    if (ok) {
      await emptyTrash();
      notify('Papierkorb geleert.');
    }
  };

  const sortedNotebooks = useMemo(
    () =>
      Object.values(notebooks)
        .map(nb => ({ id: nb.id, path: notebookPath(nb.id, notebooks) }))
        .sort((a, b) => a.path.localeCompare(b.path, 'de')),
    [notebooks],
  );

  return (
    <section className="flex h-full min-w-0 flex-col bg-surface" aria-label="Notizenliste">
      <header className="space-y-3 border-b border-line px-4 pb-3 pt-4">
        <div className="flex items-center gap-2">
          <button className="icon-btn -ml-2 lg:hidden" onClick={onOpenNav} aria-label="Navigation öffnen">
            <MenuIcon size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold tracking-tight" title={title}>
              {title}
            </h1>
            <p className="text-xs text-muted" aria-live="polite">
              {query || activeFilters ? `${plural(notes.length, 'Treffer', 'Treffer')} von ${totalInView}` : plural(notes.length, 'Notiz', 'Notizen')}
            </p>
          </div>
          {view.type === 'trash' ? (
            notes.length > 0 && (
              <button className="btn-ghost text-danger hover:text-danger" onClick={askEmptyTrash}>
                <Trash2 size={16} /> Leeren
              </button>
            )
          ) : (
            <button className="icon-btn bg-accent-soft text-accent-strong hover:bg-accent/20 hover:text-accent-strong" onClick={onNewNote} aria-label="Neue Notiz" title="Neue Notiz (Alt + N)">
              <Plus size={19} />
            </button>
          )}
        </div>

        <div className="relative lg:hidden">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input type="search" data-search className="field pl-9" placeholder="Suchen" aria-label="Notizen durchsuchen" value={query} onChange={e => setQuery(e.target.value)} />
        </div>

        <div className="flex items-center gap-2">
          <label className="relative flex min-w-0 items-center">
            <span className="sr-only">Sortierung</span>
            <ArrowDownUp size={14} className="pointer-events-none absolute left-2.5 text-muted" />
            <select
              className="cursor-pointer appearance-none rounded-lg border border-transparent bg-transparent py-1.5 pl-8 pr-2 text-xs font-medium text-muted hover:border-line hover:text-ink focus:border-accent focus:outline-none"
              value={sort}
              onChange={e => setSort(e.target.value as SortKey)}
            >
              {Object.entries(SORT_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <span className="flex-1" />
          <button
            className={`btn px-2.5 py-1.5 text-xs ${activeFilters ? 'bg-accent-soft text-accent-strong' : 'text-muted hover:bg-sunken hover:text-ink'}`}
            onClick={() => setShowFilters(s => !s)}
            aria-expanded={showFilters}
            aria-controls="list-filters"
          >
            <SlidersHorizontal size={14} /> Filter{activeFilters ? ` (${activeFilters})` : ''}
          </button>
        </div>

        {showFilters && (
          <div id="list-filters" className="grid grid-cols-1 gap-2 rounded-xl border border-line bg-canvas p-3 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">
            <label className="text-xs font-medium text-muted">
              Notizbuch
              <select
                className="field mt-1 py-1.5"
                value={filters.notebookId === undefined ? '' : filters.notebookId === null ? '__none' : filters.notebookId}
                onChange={e => setFilters({ ...filters, notebookId: e.target.value === '' ? undefined : e.target.value === '__none' ? null : e.target.value })}
              >
                <option value="">Alle Notizbücher</option>
                <option value="__none">Unsortiert</option>
                {sortedNotebooks.map(nb => (
                  <option key={nb.id} value={nb.id}>
                    {nb.path}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-muted">
              Schlagwort
              <select className="field mt-1 py-1.5" value={filters.tagId ?? ''} onChange={e => setFilters({ ...filters, tagId: e.target.value || undefined })}>
                <option value="">Alle Schlagwörter</option>
                {Object.values(tags)
                  .sort((a, b) => a.name.localeCompare(b.name, 'de'))
                  .map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </label>
            {activeFilters > 0 && (
              <button className="btn-ghost justify-start px-0 text-xs sm:col-span-2 md:col-span-1 xl:col-span-2" onClick={() => setFilters({})}>
                <X size={14} /> Filter zurücksetzen
              </button>
            )}
          </div>
        )}
      </header>

      <ul ref={listRef} className="flex-1 overflow-y-auto" onKeyDown={onKeyDown} aria-label={`${title}: Notizen`}>
        {notes.slice(0, limit).map(n => (
          <NoteRow
            key={n.id}
            note={n}
            active={n.id === selectedId}
            notebookName={view.type !== 'notebook' ? (n.notebookId && notebooks[n.notebookId]?.name) || null : null}
            tagNames={n.tagIds.map(t => tags[t]?.name).filter(Boolean) as string[]}
            query={query}
            onOpen={() => open(n.id)}
          />
        ))}
        {notes.length > limit && (
          <li ref={sentinel} className="py-4 text-center text-xs text-muted">
            Weitere Notizen werden geladen …
          </li>
        )}
        {!notes.length && (
          <li className="px-6 py-14 text-center">
            <EmptyState view={view.type} searching={!!query || activeFilters > 0} isEmptyApp={isEmptyApp} onNewNote={onNewNote} onImport={onImport} onReset={() => { setQuery(''); setFilters({}); }} />
          </li>
        )}
      </ul>
    </section>
  );
}

function NoteRow({ note, active, notebookName, tagNames, query, onOpen }: { note: Note; active: boolean; notebookName: string | null; tagNames: string[]; query: string; onOpen: () => void }) {
  const preview = useMemo(() => previewText(note.text), [note.text]);
  return (
    <li className="border-b border-line/70">
      <button
        data-note={note.id}
        className={`relative block w-full px-4 py-3.5 text-left transition-colors focus-visible:z-10 focus-visible:rounded-none ${active ? 'bg-accent-soft/70' : 'hover:bg-sunken/70'}`}
        onClick={onOpen}
        aria-current={active ? 'true' : undefined}
        draggable
        onDragStart={e => {
          e.dataTransfer.setData(DND_NOTE, note.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
      >
        {active && <span className="absolute inset-y-0 left-0 w-[3px] bg-accent" aria-hidden />}
        <div className="flex items-start gap-2">
          <h2 className={`min-w-0 flex-1 truncate text-[14.5px] font-semibold ${note.title ? 'text-ink' : 'text-muted'}`}>
            <Highlight text={note.title || 'Ohne Titel'} query={query} />
          </h2>
          {note.pinned && <Pin size={14} className="mt-0.5 shrink-0 fill-current text-accent" aria-label="Angeheftet" />}
          {note.favorite && <Star size={14} className="mt-0.5 shrink-0 fill-current text-star" aria-label="Favorit" />}
        </div>
        <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-muted">{preview ? <Highlight text={preview} query={query} /> : <i>Kein weiterer Text</i>}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted">
          <time dateTime={new Date(note.updatedAt).toISOString()}>{shortDate(note.updatedAt)}</time>
          {notebookName && <span className="truncate">· {notebookName}</span>}
          {tagNames.slice(0, 3).map(t => (
            <span key={t} className="rounded-full bg-sunken px-2 py-px text-[11px] text-muted">
              #{t}
            </span>
          ))}
          {tagNames.length > 3 && <span>+{tagNames.length - 3}</span>}
        </div>
      </button>
    </li>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  const terms = query.trim().split(/\s+/).filter(t => t.length > 1);
  if (!terms.length) return <>{text}</>;
  const re = new RegExp(`(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 ? (
          <mark key={i} className="rounded-sm bg-accent/20 px-0.5 text-inherit">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

function EmptyState({ view, searching, isEmptyApp, onNewNote, onImport, onReset }: { view: string; searching: boolean; isEmptyApp: boolean; onNewNote: () => void; onImport: () => void; onReset: () => void }) {
  if (searching)
    return (
      <>
        <p className="font-medium">Keine Treffer</p>
        <p className="mt-1 text-sm text-muted">Versuche andere Suchbegriffe oder entferne die Filter.</p>
        <button className="btn-secondary mt-4" onClick={onReset}>
          Suche und Filter zurücksetzen
        </button>
      </>
    );
  if (view === 'trash')
    return (
      <>
        <Trash2 className="mx-auto mb-3 text-faint" size={28} />
        <p className="font-medium">Der Papierkorb ist leer</p>
        <p className="mt-1 text-sm text-muted">Gelöschte Notizen landen hier und lassen sich wiederherstellen.</p>
      </>
    );
  if (view === 'favorites')
    return (
      <>
        <Star className="mx-auto mb-3 text-faint" size={28} />
        <p className="font-medium">Noch keine Favoriten</p>
        <p className="mt-1 text-sm text-muted">Markiere wichtige Notizen im Editor mit dem Stern.</p>
      </>
    );
  return (
    <>
      <p className="font-medium">{isEmptyApp ? 'Noch keine Notizen' : 'Hier ist noch nichts'}</p>
      <p className="mt-1 text-sm text-muted">Schreib deine erste Notiz{isEmptyApp ? ' oder hole deine Notizen aus Joplin.' : '.'}</p>
      <div className="mt-4 flex flex-col items-center gap-2">
        <button className="btn-primary" onClick={onNewNote}>
          <Plus size={16} /> Neue Notiz
        </button>
        {isEmptyApp && (
          <button className="btn-secondary" onClick={onImport}>
            <FileUp size={16} /> Joplin-Export (.jex) importieren
          </button>
        )}
      </div>
    </>
  );
}
