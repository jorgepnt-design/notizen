import type { Id, Note, Notebook, SortKey } from './types';

export type View =
  | { type: 'all' }
  | { type: 'favorites' }
  | { type: 'unsorted' }
  | { type: 'notebook'; id: Id }
  | { type: 'tag'; id: Id }
  | { type: 'trash' };

export interface Filters {
  /** undefined = alle, null = Unsortiert */
  notebookId?: Id | null;
  tagId?: Id;
}

/** Alle Unter-Notizbücher eines Notizbuchs (inklusive sich selbst). */
export function notebookSubtree(id: Id, notebooks: Record<Id, Notebook>): Set<Id> {
  const out = new Set<Id>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const nb of Object.values(notebooks)) {
      if (nb.parentId && out.has(nb.parentId) && !out.has(nb.id)) {
        out.add(nb.id);
        grew = true;
      }
    }
  }
  return out;
}

const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });

export function compareNotes(sort: SortKey) {
  return (a: Note, b: Note) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (sort === 'title') return collator.compare(a.title || '￿', b.title || '￿');
    if (sort === 'created') return b.createdAt - a.createdAt;
    return b.updatedAt - a.updatedAt;
  };
}

export function matchesQuery(note: Note, query: string): boolean {
  const terms = query.toLocaleLowerCase('de').split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = (note.title + '\n' + note.text).toLocaleLowerCase('de');
  return terms.every(t => hay.includes(t));
}

export function selectNotes(
  notes: Note[],
  notebooks: Record<Id, Notebook>,
  view: View,
  query: string,
  filters: Filters,
  sort: SortKey,
): Note[] {
  let list = view.type === 'trash' ? notes.filter(n => n.deletedAt) : notes.filter(n => !n.deletedAt);
  if (view.type === 'favorites') list = list.filter(n => n.favorite);
  else if (view.type === 'unsorted') list = list.filter(n => !n.notebookId);
  else if (view.type === 'notebook') {
    const ids = notebookSubtree(view.id, notebooks);
    list = list.filter(n => n.notebookId && ids.has(n.notebookId));
  } else if (view.type === 'tag') list = list.filter(n => n.tagIds.includes(view.id));

  if (filters.notebookId === null) list = list.filter(n => !n.notebookId);
  else if (filters.notebookId) {
    const ids = notebookSubtree(filters.notebookId, notebooks);
    list = list.filter(n => n.notebookId && ids.has(n.notebookId));
  }
  if (filters.tagId) list = list.filter(n => n.tagIds.includes(filters.tagId!));
  if (query.trim()) list = list.filter(n => matchesQuery(n, query));
  return [...list].sort(compareNotes(sort));
}

/** Pfad eines Notizbuchs, z. B. „Arbeit › Projekte“ */
export function notebookPath(id: Id | null, notebooks: Record<Id, Notebook>): string {
  if (!id || !notebooks[id]) return 'Unsortiert';
  const parts: string[] = [];
  let cur: Notebook | undefined = notebooks[id];
  const seen = new Set<Id>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    parts.unshift(cur.name);
    cur = cur.parentId ? notebooks[cur.parentId] : undefined;
  }
  return parts.join(' › ');
}

/** IDs aller Anhänge, auf die eine der Notizen verweist. */
export function referencedAttachments(notes: Note[]): Set<Id> {
  const used = new Set<Id>();
  for (const n of notes) for (const m of n.content.matchAll(/attachment:\/\/([0-9a-zA-Z]+)/g)) used.add(m[1]);
  return used;
}
