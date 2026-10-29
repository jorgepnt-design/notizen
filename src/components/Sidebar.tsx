'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  BookOpen,
  ChevronRight,
  FileText,
  FolderInput,
  Hash,
  HardDrive,
  Inbox,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import {
  createNotebook,
  deleteNotebook,
  deleteTag,
  moveNote,
  moveNotebook,
  notify,
  renameNotebook,
  renameTag,
  setQuery,
  setView,
  useNotes,
} from '@/store/notes';
import { notebookSubtree, type View } from '@/lib/query';
import type { Id, Notebook } from '@/lib/types';
import { confirmDialog, promptDialog } from './ui/dialogs';
import { Menu } from './ui/Menu';
import { plural } from '@/lib/format';

export const DND_NOTE = 'application/x-notizen-note';
const DND_NOTEBOOK = 'application/x-notizen-notebook';

const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });
const sameView = (a: View, b: View) => a.type === b.type && ('id' in a ? a.id : null) === ('id' in b ? b.id : null);

interface Props {
  onNavigate: () => void;
  onNewNote: () => void;
  onOpenSettings: () => void;
  onClose?: () => void;
}

export function Sidebar({ onNavigate, onNewNote, onOpenSettings, onClose }: Props) {
  const notes = useNotes(s => s.notes);
  const notebooks = useNotes(s => s.notebooks);
  const tags = useNotes(s => s.tags);
  const view = useNotes(s => s.view);
  const query = useNotes(s => s.query);
  const [collapsed, setCollapsed] = useState<Set<Id>>(new Set());
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c = { all: 0, favorites: 0, unsorted: 0, trash: 0, notebook: {} as Record<Id, number>, tag: {} as Record<Id, number> };
    for (const n of Object.values(notes)) {
      if (n.deletedAt) {
        c.trash++;
        continue;
      }
      c.all++;
      if (n.favorite) c.favorites++;
      if (!n.notebookId || !notebooks[n.notebookId]) c.unsorted++;
      else c.notebook[n.notebookId] = (c.notebook[n.notebookId] ?? 0) + 1;
      for (const t of n.tagIds) c.tag[t] = (c.tag[t] ?? 0) + 1;
    }
    return c;
  }, [notes, notebooks]);

  const children = useMemo(() => {
    const m: Record<string, Notebook[]> = {};
    for (const nb of Object.values(notebooks)) (m[nb.parentId && notebooks[nb.parentId] ? nb.parentId : ''] ??= []).push(nb);
    Object.values(m).forEach(l => l.sort((a, b) => collator.compare(a.name, b.name)));
    return m;
  }, [notebooks]);

  const totalOf = (id: Id): number => (counts.notebook[id] ?? 0) + (children[id] ?? []).reduce((s, c) => s + totalOf(c.id), 0);

  const go = (v: View) => {
    setView(v);
    onNavigate();
  };

  const newNotebook = async (parentId: Id | null = null) => {
    const name = await promptDialog({
      title: parentId ? `Neues Notizbuch in „${notebooks[parentId].name}“` : 'Neues Notizbuch',
      label: 'Name',
      confirmLabel: 'Anlegen',
    });
    if (!name) return;
    const nb = await createNotebook(name, parentId);
    if (parentId) setCollapsed(c => new Set([...c].filter(x => x !== parentId)));
    go({ type: 'notebook', id: nb.id });
  };

  const askRenameNotebook = async (nb: Notebook) => {
    const name = await promptDialog({ title: 'Notizbuch umbenennen', label: 'Name', initial: nb.name });
    if (name) await renameNotebook(nb.id, name);
  };

  const askDeleteNotebook = async (nb: Notebook) => {
    const n = counts.notebook[nb.id] ?? 0;
    const subs = children[nb.id]?.length ?? 0;
    const ok = await confirmDialog({
      title: `„${nb.name}“ löschen?`,
      message:
        (n ? `${plural(n, 'Notiz wird', 'Notizen werden')} nicht gelöscht, sondern nach „Unsortiert“ verschoben.` : 'Das Notizbuch ist leer.') +
        (subs ? ` ${plural(subs, 'Unter-Notizbuch rückt', 'Unter-Notizbücher rücken')} eine Ebene nach oben.` : ''),
      confirmLabel: 'Notizbuch löschen',
      danger: true,
    });
    if (!ok) return;
    const moved = await deleteNotebook(nb.id);
    notify(moved ? `Notizbuch gelöscht. ${plural(moved, 'Notiz liegt', 'Notizen liegen')} jetzt in „Unsortiert“.` : 'Notizbuch gelöscht.');
  };

  const askRenameTag = async (id: Id) => {
    const name = await promptDialog({ title: 'Schlagwort umbenennen', label: 'Name', initial: tags[id].name });
    if (name) await renameTag(id, name);
  };

  const askDeleteTag = async (id: Id) => {
    const ok = await confirmDialog({
      title: `Schlagwort „${tags[id].name}“ löschen?`,
      message: 'Das Schlagwort wird von allen Notizen entfernt. Die Notizen selbst bleiben erhalten.',
      confirmLabel: 'Schlagwort löschen',
      danger: true,
    });
    if (ok) await deleteTag(id);
  };

  // Drag & Drop: Notizen auf Notizbücher ziehen, Notizbücher verschachteln
  const dropProps = (target: Id | null, key: string) => ({
    onDragOver: (e: React.DragEvent) => {
      const types = Array.from(e.dataTransfer.types);
      if (types.includes(DND_NOTE) || types.includes(DND_NOTEBOOK)) {
        e.preventDefault();
        setDropTarget(key);
      }
    },
    onDragLeave: () => setDropTarget(t => (t === key ? null : t)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDropTarget(null);
      const noteId = e.dataTransfer.getData(DND_NOTE);
      const nbId = e.dataTransfer.getData(DND_NOTEBOOK);
      if (noteId) {
        moveNote(noteId, target);
        notify(`Notiz verschoben nach „${target ? notebooks[target]?.name : 'Unsortiert'}“.`);
      } else if (nbId && nbId !== target) {
        if (target && notebookSubtree(nbId, notebooks).has(target)) return;
        void moveNotebook(nbId, target);
      }
    },
  });

  const renderNotebook = (nb: Notebook, depth: number): ReactNode => {
    const kids = children[nb.id] ?? [];
    const open = !collapsed.has(nb.id);
    const v: View = { type: 'notebook', id: nb.id };
    return (
      <li key={nb.id}>
        <NavRow
          active={sameView(view, v)}
          onClick={() => go(v)}
          icon={<BookOpen size={16} />}
          label={nb.name}
          count={totalOf(nb.id)}
          depth={depth}
          drop={dropTarget === nb.id}
          draggable
          onDragStart={e => {
            e.dataTransfer.setData(DND_NOTEBOOK, nb.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          {...dropProps(nb.id, nb.id)}
          toggle={
            kids.length ? (
              <button
                className="flex h-6 w-6 items-center justify-center rounded text-faint hover:text-ink"
                aria-label={open ? `„${nb.name}“ zuklappen` : `„${nb.name}“ aufklappen`}
                aria-expanded={open}
                onClick={e => {
                  e.stopPropagation();
                  setCollapsed(c => {
                    const s = new Set(c);
                    if (s.has(nb.id)) s.delete(nb.id);
                    else s.add(nb.id);
                    return s;
                  });
                }}
              >
                <ChevronRight size={14} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
              </button>
            ) : (
              <span className="w-6" />
            )
          }
          menu={
            <Menu
              label={`Aktionen für „${nb.name}“`}
              trigger={<MoreHorizontal size={16} />}
              triggerClassName="icon-btn h-7 w-7"
              items={[
                { label: 'Neues Unter-Notizbuch', icon: <Plus size={15} />, onSelect: () => newNotebook(nb.id) },
                { label: 'Umbenennen', icon: <Pencil size={15} />, onSelect: () => askRenameNotebook(nb) },
                !!nb.parentId && { label: 'Auf oberste Ebene', icon: <FolderInput size={15} />, onSelect: () => moveNotebook(nb.id, null) },
                { label: 'Löschen', icon: <Trash2 size={15} />, danger: true, onSelect: () => askDeleteNotebook(nb) },
              ]}
            />
          }
        />
        {open && kids.length > 0 && <ul>{kids.map(k => renderNotebook(k, depth + 1))}</ul>}
      </li>
    );
  };

  const tagList = Object.values(tags)
    .filter(t => counts.tag[t.id])
    .sort((a, b) => collator.compare(a.name, b.name));

  return (
    <nav className="flex h-full flex-col bg-sunken/60" aria-label="Navigation">
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-on-accent shadow-sm">
          <FileText size={17} strokeWidth={2.4} />
        </span>
        <span className="text-[15px] font-semibold tracking-tight">Notizen</span>
        {onClose && (
          <button className="icon-btn ml-auto" onClick={onClose} aria-label="Navigation schließen">
            <X size={18} />
          </button>
        )}
      </div>

      <div className="space-y-2 px-3">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            type="search"
            data-search
            className="field pl-9 pr-12"
            placeholder="Suchen"
            aria-label="Notizen durchsuchen"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') onNavigate();
            }}
          />
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-line bg-canvas px-1.5 text-[11px] text-muted lg:block">
            Strg K
          </kbd>
        </div>
        <button className="btn-primary w-full" onClick={onNewNote} title="Neue Notiz (Alt + N)">
          <Plus size={17} /> Neue Notiz
        </button>
      </div>

      <div className="mt-4 flex-1 overflow-y-auto px-2 pb-4">
        <ul className="space-y-0.5">
          <li>
            <NavRow active={sameView(view, { type: 'all' })} onClick={() => go({ type: 'all' })} icon={<FileText size={16} />} label="Alle Notizen" count={counts.all} />
          </li>
          <li>
            <NavRow active={sameView(view, { type: 'favorites' })} onClick={() => go({ type: 'favorites' })} icon={<Star size={16} />} label="Favoriten" count={counts.favorites} />
          </li>
        </ul>

        <SectionHeading
          label="Notizbücher"
          action={
            <button className="icon-btn h-7 w-7" onClick={() => newNotebook(null)} aria-label="Neues Notizbuch" title="Neues Notizbuch">
              <Plus size={16} />
            </button>
          }
        />
        <ul className="space-y-0.5">
          <li>
            <NavRow
              active={sameView(view, { type: 'unsorted' })}
              onClick={() => go({ type: 'unsorted' })}
              icon={<Inbox size={16} />}
              label="Unsortiert"
              count={counts.unsorted}
              toggle={<span className="w-6" />}
              drop={dropTarget === 'unsorted'}
              {...dropProps(null, 'unsorted')}
            />
          </li>
          {(children[''] ?? []).map(nb => renderNotebook(nb, 0))}
        </ul>
        {!Object.keys(notebooks).length && <p className="px-3 py-1 text-xs text-muted">Lege mit + dein erstes Notizbuch an.</p>}

        <SectionHeading label="Schlagwörter" />
        {tagList.length ? (
          <ul className="space-y-0.5">
            {tagList.map(t => {
              const v: View = { type: 'tag', id: t.id };
              return (
                <li key={t.id}>
                  <NavRow
                    active={sameView(view, v)}
                    onClick={() => go(v)}
                    icon={<Hash size={16} />}
                    label={t.name}
                    count={counts.tag[t.id]}
                    menu={
                      <Menu
                        label={`Aktionen für Schlagwort „${t.name}“`}
                        trigger={<MoreHorizontal size={16} />}
                        triggerClassName="icon-btn h-7 w-7"
                        items={[
                          { label: 'Umbenennen', icon: <Pencil size={15} />, onSelect: () => askRenameTag(t.id) },
                          { label: 'Löschen', icon: <Trash2 size={15} />, danger: true, onSelect: () => askDeleteTag(t.id) },
                        ]}
                      />
                    }
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-3 py-1 text-xs leading-relaxed text-muted">Schlagwörter vergibst du direkt in einer Notiz unter dem Titel.</p>
        )}

        <ul className="mt-4 border-t border-line pt-3">
          <li>
            <NavRow active={sameView(view, { type: 'trash' })} onClick={() => go({ type: 'trash' })} icon={<Trash2 size={16} />} label="Papierkorb" count={counts.trash} />
          </li>
        </ul>
      </div>

      <div className="border-t border-line px-2 py-2">
        <button className="btn-ghost w-full justify-start" onClick={onOpenSettings}>
          <Settings size={16} /> Einstellungen
        </button>
        <p className="flex items-center gap-1.5 px-3 pb-1 text-[11px] text-muted">
          <HardDrive size={12} /> Nur auf diesem Gerät gespeichert
        </p>
      </div>
    </nav>
  );
}

function SectionHeading({ label, action }: { label: string; action?: ReactNode }) {
  return (
    <div className="mb-1 mt-5 flex items-center justify-between pl-3 pr-1">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</h3>
      {action}
    </div>
  );
}

interface RowProps extends React.HTMLAttributes<HTMLDivElement> {
  active: boolean;
  icon: ReactNode;
  label: string;
  count?: number;
  depth?: number;
  drop?: boolean;
  toggle?: ReactNode;
  menu?: ReactNode;
}

function NavRow({ active, icon, label, count, depth = 0, drop, toggle, menu, onClick, ...rest }: RowProps) {
  return (
    <div
      {...rest}
      className={`group flex items-center rounded-lg pr-1 text-sm transition-colors ${
        active ? 'bg-accent-soft font-medium text-accent-strong' : 'text-ink hover:bg-sunken'
      } ${drop ? 'ring-2 ring-accent' : ''}`}
      style={{ paddingLeft: depth * 14 }}
    >
      {toggle}
      <button
        className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-1.5 text-left ${toggle ? 'pl-0.5' : 'pl-3'}`}
        onClick={onClick as unknown as React.MouseEventHandler<HTMLButtonElement>}
        aria-current={active ? 'page' : undefined}
      >
        <span className={active ? 'text-accent' : 'text-muted'}>{icon}</span>
        <span className="truncate">{label}</span>
      </button>
      {!!count && <span className={`px-1.5 text-xs tabular-nums ${active ? 'text-accent-strong' : 'text-muted'}`}>{count}</span>}
      {menu && <div className="opacity-100 lg:opacity-0 lg:focus-within:opacity-100 lg:group-hover:opacity-100">{menu}</div>}
    </div>
  );
}
