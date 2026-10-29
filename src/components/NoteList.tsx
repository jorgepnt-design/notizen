'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownUp, ArrowLeft, CheckSquare, Copy, FileUp, FolderInput, Menu as MenuIcon, Pin, Plus, RefreshCw, RotateCcw, Search, SlidersHorizontal, Square, Star, Trash2, X } from 'lucide-react';
import {
  copyNotes,
  deleteNotesForever,
  emptyTrash,
  moveNotes,
  notify,
  restoreNote,
  selectNote,
  setFilters,
  setQuery,
  setSort,
  trashNotes,
  useNotes,
} from '@/store/notes';
import { notebookPath, selectNotes } from '@/lib/query';
import { previewText } from '@/lib/html';
import { plural, shortDate } from '@/lib/format';
import type { Id, Note, SortKey } from '@/lib/types';
import { chooseDialog, confirmDialog } from './ui/dialogs';
import { BrandMark, DND_NOTE } from './Sidebar';

const STEP = 100;
const SORT_LABEL: Record<SortKey, string> = { updated: 'Zuletzt geändert', created: 'Erstellt', title: 'Titel (A–Z)' };

interface Props {
  onOpenNav: () => void;
  onOpened: () => void;
  onNewNote: () => void;
  onImport: () => void;
  /** gesetzt, wenn es eine vorherige Seite gibt */
  onBack?: () => void;
  onRefresh: () => void;
}

export function NoteList({ onOpenNav, onOpened, onNewNote, onImport, onBack, onRefresh }: Props) {
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
  // Mehrfachauswahl
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<Id>>(new Set());
  // Notiz, deren Löschen-Knopf gerade aufgewischt ist
  const [swiped, setSwiped] = useState<Id | null>(null);
  // Nach langem Drücken erscheint die Auswahlleiste und verschiebt die Liste –
  // der Tipp beim Loslassen darf dann keine andere Notiz treffen.
  const ignoreTapsUntil = useRef(0);
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
    setSelecting(false);
    setPicked(new Set());
    setSwiped(null);
  }, [view, query, filters, sort]);

  // Ausgewählte Notizen, die es nicht mehr gibt, aus der Auswahl nehmen
  useEffect(() => {
    setPicked(p => {
      const next = new Set([...p].filter(id => notes.some(n => n.id === id)));
      return next.size === p.size ? p : next;
    });
  }, [notes]);

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
    if (Date.now() < ignoreTapsUntil.current) return;
    if (swiped) {
      setSwiped(null);
      return;
    }
    if (selecting) {
      toggle(id);
      return;
    }
    selectNote(id);
    onOpened();
  };

  const toggle = (id: Id) =>
    setPicked(p => {
      const s = new Set(p);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  const startSelecting = (id?: Id) => {
    if (id) ignoreTapsUntil.current = Date.now() + 800;
    setSwiped(null);
    setSelecting(true);
    setPicked(new Set(id ? [id] : []));
  };
  const allPicked = notes.length > 0 && picked.size === notes.length;
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(notes.map(n => n.id)));

  // Strg/⌘ + A wählt im Auswahlmodus alle Notizen der Ansicht aus
  useEffect(() => {
    if (!selecting) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a' && !t.isContentEditable && !/^(INPUT|TEXTAREA)$/.test(t.tagName)) {
        e.preventDefault();
        setPicked(new Set(notes.map(n => n.id)));
      } else if (e.key === 'Escape' && !document.querySelector('[role=dialog]')) {
        setSelecting(false);
        setPicked(new Set());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selecting, notes]);

  const stopSelecting = () => {
    setSelecting(false);
    setPicked(new Set());
  };

  const inTrash = view.type === 'trash';

  const chooseNotebook = async (title: string, confirmLabel: string) => {
    const choice = await chooseDialog({
      title,
      label: 'Ziel-Notizbuch',
      options: [{ value: '__none', label: 'Unsortiert' }, ...sortedNotebooks.map(nb => ({ value: nb.id, label: nb.path }))],
      confirmLabel,
    });
    return choice === null ? undefined : choice === '__none' ? null : choice;
  };

  const bulkMove = async () => {
    const ids = [...picked];
    const target = await chooseNotebook(`${plural(ids.length, 'Notiz', 'Notizen')} verschieben`, 'Verschieben');
    if (target === undefined) return;
    moveNotes(ids, target);
    notify(`${plural(ids.length, 'Notiz', 'Notizen')} verschoben nach „${target ? notebooks[target]?.name : 'Unsortiert'}“.`);
    stopSelecting();
  };

  const bulkCopy = async () => {
    const ids = [...picked];
    const target = await chooseNotebook(`${plural(ids.length, 'Notiz', 'Notizen')} kopieren`, 'Kopieren');
    if (target === undefined) return;
    copyNotes(ids, target);
    notify(`${plural(ids.length, 'Kopie', 'Kopien')} angelegt in „${target ? notebooks[target]?.name : 'Unsortiert'}“.`);
    stopSelecting();
  };

  /** Löschen mit Rückfrage – im Papierkorb endgültig, sonst in den Papierkorb */
  const askDelete = async (ids: Id[]) => {
    if (!ids.length) return false;
    const one = ids.length === 1 ? `„${notesById[ids[0]]?.title || 'Ohne Titel'}“` : plural(ids.length, 'Notiz', 'Notizen');
    const ok = await confirmDialog(
      inTrash
        ? { title: `${one} endgültig löschen?`, message: 'Das lässt sich nicht rückgängig machen.', confirmLabel: 'Endgültig löschen', danger: true }
        : { title: `${one} löschen?`, message: 'Die Notiz wandert in den Papierkorb und lässt sich von dort wiederherstellen.', confirmLabel: 'Löschen', danger: true },
    );
    if (!ok) return false;
    if (inTrash) {
      await deleteNotesForever(ids);
      notify(ids.length === 1 ? 'Notiz endgültig gelöscht.' : `${ids.length} Notizen endgültig gelöscht.`);
    } else trashNotes(ids);
    return true;
  };

  const bulkDelete = async () => {
    if (await askDelete([...picked])) stopSelecting();
  };

  const bulkRestore = () => {
    const ids = [...picked];
    ids.forEach(restoreNote);
    notify(`${plural(ids.length, 'Notiz', 'Notizen')} wiederhergestellt.`);
    stopSelecting();
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
        {/* Auf Handy/Tablet ist die Seitenleiste eingeklappt – App-Name daher hier zeigen */}
        <div className="flex items-center gap-2 lg:hidden">
          <BrandMark size={22} />
          <span className="text-sm font-semibold tracking-tight">
            Notizen <span className="font-medium text-accent">by Jorge</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onBack && (
            <button className="icon-btn -ml-2" onClick={onBack} aria-label="Zurück zur vorherigen Seite" title="Zurück">
              <ArrowLeft size={20} />
            </button>
          )}
          <button className={`icon-btn lg:hidden ${onBack ? '' : '-ml-2'}`} onClick={onOpenNav} aria-label="Navigation öffnen">
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
          <button className="icon-btn" onClick={onRefresh} aria-label="Aktualisieren" title="Aktualisieren">
            <RefreshCw size={18} />
          </button>
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
          {notes.length > 0 && (
            <button
              className={`btn px-2.5 py-1.5 text-xs ${selecting ? 'bg-accent-soft text-accent-strong' : 'text-muted hover:bg-sunken hover:text-ink'}`}
              onClick={() => (selecting ? stopSelecting() : startSelecting())}
              aria-pressed={selecting}
            >
              <CheckSquare size={14} /> {selecting ? 'Fertig' : 'Auswählen'}
            </button>
          )}
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

      {selecting && (
        <div className="flex items-center gap-2 border-b border-line bg-accent-soft/60 px-4 py-2 text-sm" role="status">
          <span className="flex-1 font-medium text-accent-strong">{picked.size ? `${picked.size} ausgewählt` : 'Notizen antippen zum Auswählen'}</span>
          <button className="btn-secondary px-2.5 py-1 text-xs" onClick={toggleAll} title="Alle auswählen (Strg/⌘ + A)">
            {allPicked ? <Square size={14} /> : <CheckSquare size={14} />}
            {allPicked ? 'Auswahl aufheben' : `Alle auswählen (${notes.length})`}
          </button>
          <button className="icon-btn h-8 w-8" onClick={stopSelecting} aria-label="Auswahl beenden">
            <X size={16} />
          </button>
        </div>
      )}

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
            selecting={selecting}
            picked={picked.has(n.id)}
            swiped={swiped === n.id}
            onSwipe={open => setSwiped(open ? n.id : null)}
            onLongPress={() => startSelecting(n.id)}
            onDelete={async () => {
              setSwiped(null);
              await askDelete([n.id]);
            }}
            inTrash={inTrash}
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

      {selecting && picked.size > 0 && (
        <div className="grid grid-cols-3 gap-1 border-t border-line bg-surface p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]" role="toolbar" aria-label="Aktionen für die Auswahl">
          {inTrash ? (
            <>
              <BarButton icon={<RotateCcw size={18} />} label="Wiederherstellen" onClick={bulkRestore} />
              <span />
              <BarButton icon={<Trash2 size={18} />} label="Endgültig löschen" onClick={bulkDelete} danger />
            </>
          ) : (
            <>
              <BarButton icon={<FolderInput size={18} />} label="Verschieben" onClick={bulkMove} />
              <BarButton icon={<Copy size={18} />} label="Kopieren" onClick={bulkCopy} />
              <BarButton icon={<Trash2 size={18} />} label="Löschen" onClick={bulkDelete} danger />
            </>
          )}
        </div>
      )}
    </section>
  );
}

function BarButton({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button className={`flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium hover:bg-sunken ${danger ? 'text-danger' : 'text-ink'}`} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

const SWIPE_OPEN = 88;

interface RowProps {
  note: Note;
  active: boolean;
  notebookName: string | null;
  tagNames: string[];
  query: string;
  onOpen: () => void;
  selecting: boolean;
  picked: boolean;
  swiped: boolean;
  onSwipe: (open: boolean) => void;
  onLongPress: () => void;
  onDelete: () => void;
  inTrash: boolean;
}

function NoteRow(props: RowProps) {
  const { selecting, picked, swiped, onSwipe, onLongPress, onDelete, inTrash } = props;
  const [drag, setDrag] = useState<number | null>(null); // aktuelle Verschiebung beim Wischen
  const touch = useRef<{ x: number; y: number; dir: 'h' | 'v' | null; long?: ReturnType<typeof setTimeout> } | null>(null);
  /** Klick nach langem Drücken oder Wischen nicht als „Öffnen“ werten */
  const suppressClick = useRef(false);
  const offset = drag ?? (swiped ? -SWIPE_OPEN : 0);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    const state: NonNullable<typeof touch.current> = { x: t.clientX, y: t.clientY, dir: null };
    // Lange gedrückt halten = Auswahl starten
    if (!selecting)
      state.long = setTimeout(() => {
        suppressClick.current = true;
        navigator.vibrate?.(15);
        onLongPress();
      }, 550);
    touch.current = state;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = touch.current;
    if (!s) return;
    const t = e.touches[0];
    const mx = t.clientX - s.x;
    const my = t.clientY - s.y;
    if (Math.abs(mx) > 8 || Math.abs(my) > 8) clearTimeout(s.long);
    if (!s.dir && (Math.abs(mx) > 10 || Math.abs(my) > 10)) s.dir = Math.abs(mx) > Math.abs(my) && !selecting ? 'h' : 'v';
    if (s.dir === 'h') setDrag(Math.max(-160, Math.min(0, mx + (swiped ? -SWIPE_OPEN : 0))));
  };
  const onTouchEnd = () => {
    const s = touch.current;
    touch.current = null;
    if (!s) return;
    clearTimeout(s.long);
    if (s.dir === 'h') {
      suppressClick.current = true;
      const d = drag ?? 0;
      if (d < -140) {
        onSwipe(false);
        onDelete(); // ganz durchgewischt: direkt nachfragen
      } else onSwipe(d < -SWIPE_OPEN / 2);
    }
    setDrag(null);
  };

  return (
    <li className="relative overflow-hidden border-b border-line/70">
      {/* Löschen-Knopf hinter der Notiz (sichtbar nach Wischen nach links) */}
      <button
        className="absolute inset-y-0 right-0 flex w-[88px] flex-col items-center justify-center gap-1 bg-danger text-xs font-medium text-white dark:text-canvas"
        onClick={onDelete}
        tabIndex={swiped ? 0 : -1}
        aria-hidden={!swiped}
      >
        <Trash2 size={18} />
        {inTrash ? 'Endgültig' : 'Löschen'}
      </button>
      <NoteRowBody
        {...props}
        style={{ transform: offset ? `translateX(${offset}px)` : undefined, transition: drag === null ? 'transform 180ms ease' : 'none' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClickCapture={e => {
          if (!suppressClick.current) return;
          suppressClick.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
        picked={picked}
      />
    </li>
  );
}

function NoteRowBody({
  note,
  active,
  notebookName,
  tagNames,
  query,
  onOpen,
  selecting,
  picked,
  style,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onClickCapture,
}: RowProps & {
  style: React.CSSProperties;
  onTouchStart: React.TouchEventHandler;
  onTouchMove: React.TouchEventHandler;
  onTouchEnd: React.TouchEventHandler;
  onClickCapture: React.MouseEventHandler;
}) {
  const preview = useMemo(() => previewText(note.text), [note.text]);
  return (
    <button
      data-note={note.id}
      className={`relative flex w-full touch-pan-y gap-3 px-4 py-3.5 text-left focus-visible:z-10 focus-visible:rounded-none ${
        picked ? 'bg-accent-soft' : active && !selecting ? 'bg-[rgb(var(--accent-soft))]' : 'bg-surface hover:bg-sunken'
      }`}
      style={style}
      onClick={onOpen}
      onClickCapture={onClickCapture}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      onContextMenu={e => selecting || e.preventDefault()}
      aria-current={active ? 'true' : undefined}
      aria-pressed={selecting ? picked : undefined}
      draggable={!selecting}
      onDragStart={e => {
        e.dataTransfer.setData(DND_NOTE, note.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
    >
      {active && !selecting && <span className="absolute inset-y-0 left-0 w-[3px] bg-accent" aria-hidden />}
      {selecting && (
        <span className={`mt-0.5 shrink-0 ${picked ? 'text-accent' : 'text-faint'}`} aria-hidden>
          {picked ? <CheckSquare size={20} /> : <Square size={20} />}
        </span>
      )}
      <span className="block min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <span className={`min-w-0 flex-1 truncate text-[14.5px] font-semibold ${note.title ? 'text-ink' : 'text-muted'}`}>
            <Highlight text={note.title || 'Ohne Titel'} query={query} />
          </span>
          {note.pinned && <Pin size={14} className="mt-0.5 shrink-0 fill-current text-accent" aria-label="Angeheftet" />}
          {note.favorite && <Star size={14} className="mt-0.5 shrink-0 fill-current text-star" aria-label="Favorit" />}
        </span>
        <span className="mt-1 line-clamp-2 block text-[13px] leading-5 text-muted">{preview ? <Highlight text={preview} query={query} /> : <i>Kein weiterer Text</i>}</span>
        <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted">
          <time dateTime={new Date(note.updatedAt).toISOString()}>{shortDate(note.updatedAt)}</time>
          {notebookName && <span className="truncate">· {notebookName}</span>}
          {tagNames.slice(0, 3).map(t => (
            <span key={t} className="rounded-full bg-sunken px-2 py-px text-[11px] text-muted">
              #{t}
            </span>
          ))}
          {tagNames.length > 3 && <span>+{tagNames.length - 3}</span>}
        </span>
      </span>
    </button>
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
