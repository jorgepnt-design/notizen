'use client';

import { create } from 'zustand';
import { getRepository } from '@/lib/storage';
import { createSeed } from '@/lib/seed';
import { forgetAttachmentUrls } from '@/lib/attachments';
import { notebookSubtree, referencedAttachments, type Filters, type View } from '@/lib/query';
import { importJex, type ImportStats } from '@/lib/jex/joplin';
import {
  DEFAULT_SETTINGS,
  newId,
  type Attachment,
  type Id,
  type Note,
  type Notebook,
  type Settings,
  type SortKey,
  type Tag,
  type Theme,
} from '@/lib/types';

export type SaveState = 'saved' | 'pending' | 'saving' | 'error';

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'error';
  action?: { label: string; run: () => void };
}

interface State {
  ready: boolean;
  loadError: string | null;
  notes: Record<Id, Note>;
  notebooks: Record<Id, Notebook>;
  tags: Record<Id, Tag>;
  attachments: Record<Id, Attachment>;
  settings: Settings;

  view: View;
  selectedId: Id | null;
  query: string;
  filters: Filters;

  saveState: SaveState;
  lastSavedAt: number | null;
  toasts: Toast[];
}

const byId = <T extends { id: Id }>(list: T[]) => Object.fromEntries(list.map(x => [x.id, x])) as Record<Id, T>;
const omit = <T,>(rec: Record<Id, T>, ids: Iterable<Id>) => {
  const c = { ...rec };
  for (const id of ids) delete c[id];
  return c;
};

export const useNotes = create<State>(() => ({
  ready: false,
  loadError: null,
  notes: {},
  notebooks: {},
  tags: {},
  attachments: {},
  settings: DEFAULT_SETTINGS,
  view: { type: 'all' },
  selectedId: null,
  query: '',
  filters: {},
  saveState: 'saved',
  lastSavedAt: null,
  toasts: [],
}));

const get = useNotes.getState;
const set = useNotes.setState;
const repo = () => getRepository();

// ---------------------------------------------------------------------------
// Meldungen

let toastSeq = 0;
export function notify(message: string, kind: Toast['kind'] = 'info', action?: Toast['action']) {
  const id = ++toastSeq;
  set(s => ({ toasts: [...s.toasts.slice(-2), { id, message, kind, action }] }));
  setTimeout(() => dismissToast(id), kind === 'error' ? 9000 : 5000);
}
export const dismissToast = (id: number) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));

/** Führt einen Speicherzugriff aus und meldet Fehler verständlich. */
async function persist(what: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    console.error(e);
    notify(`${what} konnte nicht gespeichert werden. Ist der Speicher des Browsers voll?`, 'error');
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Automatisches Speichern der Notizen
//
// Änderungen landen sofort im Zustand (die Oberfläche bleibt flüssig) und werden
// gebündelt nach kurzer Pause in IndexedDB geschrieben. Schreibvorgänge laufen
// nacheinander, damit ein älterer Stand nie einen neueren überschreibt.

const pending = new Set<Id>();
let timer: ReturnType<typeof setTimeout> | undefined;
let chain: Promise<void> = Promise.resolve();
const SAVE_DELAY = 500;

function scheduleSave(ids: Id[]) {
  ids.forEach(id => pending.add(id));
  set({ saveState: 'pending' });
  clearTimeout(timer);
  timer = setTimeout(() => void flushSaves(), SAVE_DELAY);
}

export function hasUnsavedChanges() {
  return pending.size > 0 || get().saveState === 'saving' || get().saveState === 'error';
}

export function flushSaves(): Promise<void> {
  clearTimeout(timer);
  if (!pending.size) return chain;
  const ids = [...pending];
  pending.clear();
  set({ saveState: 'saving' });
  chain = chain.then(async () => {
    const { notes } = get();
    const live = ids.map(id => notes[id]).filter(Boolean);
    try {
      await repo().saveNotes(live);
      if (!pending.size) set({ saveState: 'saved', lastSavedAt: Date.now() });
    } catch (e) {
      console.error(e);
      ids.forEach(id => pending.add(id)); // beim nächsten Versuch erneut speichern
      set({ saveState: 'error' });
    }
  });
  return chain;
}

function putNotes(list: Note[], immediate = false) {
  if (!list.length) return;
  set(s => ({ notes: { ...s.notes, ...byId(list) } }));
  scheduleSave(list.map(n => n.id));
  if (immediate) void flushSaves();
}

// ---------------------------------------------------------------------------
// Start

let initStarted = false;
export async function init() {
  if (initStarted) return;
  initStarted = true;
  try {
    const data = await repo().loadAll();
    let { notes, notebooks, tags, settings } = data;
    if (!settings.seeded) {
      if (!notes.length) {
        const seed = createSeed();
        await repo().saveNotebooks(seed.notebooks);
        await repo().saveTags(seed.tags);
        await repo().saveNotes(seed.notes);
        ({ notes, notebooks, tags } = { notes: seed.notes, notebooks: seed.notebooks, tags: seed.tags });
      }
      settings = { ...settings, seeded: true };
      await repo().saveSettings(settings);
    }
    set({
      ready: true,
      notes: byId(notes),
      notebooks: byId(notebooks),
      tags: byId(tags),
      attachments: byId(data.attachments),
      settings,
    });
    applyTheme(settings.theme);
    navigator.storage?.persist?.().catch(() => undefined);
  } catch (e) {
    console.error(e);
    set({
      ready: true,
      loadError:
        'Der lokale Speicher dieses Browsers ist nicht verfügbar. Im privaten Modus oder bei blockierten Website-Daten kann die App nichts speichern.',
    });
  }
}

// ---------------------------------------------------------------------------
// Ansicht, Auswahl, Suche

export function setView(view: View) {
  void flushSaves();
  set({ view, filters: {}, selectedId: null });
}

export function selectNote(id: Id | null) {
  void flushSaves();
  set({ selectedId: id });
}

export const setQuery = (query: string) => set({ query });
export const setFilters = (filters: Filters) => set({ filters });

export async function updateSettings(patch: Partial<Settings>) {
  const settings = { ...get().settings, ...patch };
  set({ settings });
  if (patch.theme) applyTheme(patch.theme);
  await persist('Die Einstellung', () => repo().saveSettings(settings));
}
export const setSort = (sort: SortKey) => updateSettings({ sort });
export const setTheme = (theme: Theme) => updateSettings({ theme });

let mediaListener: (() => void) | null = null;
function applyTheme(theme: Theme) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && mq.matches));
  apply();
  if (mediaListener) mq.removeEventListener('change', mediaListener);
  mediaListener = theme === 'system' ? apply : null;
  if (mediaListener) mq.addEventListener('change', mediaListener);
  try {
    localStorage.setItem('notizen.theme', theme); // für das Farbschema vor dem ersten Zeichnen
  } catch {
    /* ohne localStorage startet die App kurz im Systemschema */
  }
}

// ---------------------------------------------------------------------------
// Notizen

export function createNote(): Id {
  const { view, filters } = get();
  const now = Date.now();
  const notebookId =
    view.type === 'notebook' ? view.id : filters.notebookId ? filters.notebookId : null;
  const tagIds = view.type === 'tag' ? [view.id] : filters.tagId ? [filters.tagId] : [];
  const note: Note = {
    id: newId(),
    title: '',
    content: '',
    text: '',
    notebookId,
    tagIds,
    favorite: view.type === 'favorites',
    pinned: false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  putNotes([note], true);
  set(s => ({
    selectedId: note.id,
    query: '',
    view: s.view.type === 'trash' ? { type: 'all' } : s.view,
  }));
  return note.id;
}

/** Inhalt/Titel ändern (aus dem Editor). */
export function editNote(id: Id, patch: { title?: string; content?: string; text?: string }) {
  const n = get().notes[id];
  if (!n) return;
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (!keys.some(k => patch[k] !== n[k])) return;
  putNotes([{ ...n, ...patch, updatedAt: Date.now() }]);
}

function patchNote(id: Id, patch: Partial<Note>, touch = true) {
  const n = get().notes[id];
  if (n) putNotes([{ ...n, ...patch, ...(touch ? { updatedAt: Date.now() } : {}) }], true);
}

export const toggleFavorite = (id: Id) => patchNote(id, { favorite: !get().notes[id]?.favorite }, false);
export const togglePinned = (id: Id) => patchNote(id, { pinned: !get().notes[id]?.pinned }, false);
export const moveNote = (id: Id, notebookId: Id | null) => patchNote(id, { notebookId });

export function duplicateNote(id: Id) {
  const n = get().notes[id];
  if (!n) return;
  const now = Date.now();
  const copy: Note = { ...n, id: newId(), title: (n.title || 'Ohne Titel') + ' (Kopie)', pinned: false, createdAt: now, updatedAt: now, deletedAt: null };
  putNotes([copy], true);
  set({ selectedId: copy.id });
  notify('Notiz dupliziert.');
}

export function trashNote(id: Id) {
  patchNote(id, { deletedAt: Date.now(), pinned: false }, false);
  notify('Notiz in den Papierkorb verschoben.', 'info', { label: 'Rückgängig', run: () => restoreNote(id) });
}

export function restoreNote(id: Id) {
  const { notes, notebooks } = get();
  const n = notes[id];
  if (!n) return;
  patchNote(id, { deletedAt: null, notebookId: n.notebookId && notebooks[n.notebookId] ? n.notebookId : null }, false);
}

async function purgeNotes(ids: Id[]) {
  await flushSaves();
  const gone = new Set(ids);
  ids.forEach(id => pending.delete(id));
  const rest = Object.values(get().notes).filter(n => !gone.has(n.id));
  set(s => ({ notes: byId(rest), selectedId: s.selectedId && gone.has(s.selectedId) ? null : s.selectedId }));
  await persist('Das Löschen', () => repo().deleteNotes(ids));
  // Anhänge, die keine Notiz mehr verwendet, ebenfalls entfernen
  const used = referencedAttachments(rest);
  const orphans = Object.keys(get().attachments).filter(id => !used.has(id));
  if (orphans.length) {
    set(s => ({ attachments: omit(s.attachments, orphans) }));
    forgetAttachmentUrls(orphans);
    await repo().deleteAttachments(orphans).catch(console.error);
  }
}

export const deleteNoteForever = (id: Id) => purgeNotes([id]);
export const emptyTrash = () => purgeNotes(Object.values(get().notes).filter(n => n.deletedAt).map(n => n.id));

// ---------------------------------------------------------------------------
// Notizbücher

export async function createNotebook(name: string, parentId: Id | null = null) {
  const now = Date.now();
  const nb: Notebook = { id: newId(), name: name.trim(), parentId, createdAt: now, updatedAt: now };
  set(s => ({ notebooks: { ...s.notebooks, [nb.id]: nb } }));
  await persist('Das Notizbuch', () => repo().saveNotebooks([nb]));
  return nb;
}

export async function renameNotebook(id: Id, name: string) {
  const nb = { ...get().notebooks[id], name: name.trim(), updatedAt: Date.now() };
  set(s => ({ notebooks: { ...s.notebooks, [id]: nb } }));
  await persist('Das Notizbuch', () => repo().saveNotebooks([nb]));
}

export async function moveNotebook(id: Id, parentId: Id | null) {
  const { notebooks } = get();
  if (parentId && notebookSubtree(id, notebooks).has(parentId)) return;
  const nb = { ...notebooks[id], parentId, updatedAt: Date.now() };
  set(s => ({ notebooks: { ...s.notebooks, [id]: nb } }));
  await persist('Das Notizbuch', () => repo().saveNotebooks([nb]));
}

/** Löscht ein Notizbuch. Seine Notizen wandern nach „Unsortiert“, Unter-Notizbücher eine Ebene nach oben. */
export async function deleteNotebook(id: Id) {
  const { notebooks, notes, view } = get();
  const nb = notebooks[id];
  if (!nb) return;
  const moved = Object.values(notes).filter(n => n.notebookId === id).map(n => ({ ...n, notebookId: null }));
  const children = Object.values(notebooks).filter(c => c.parentId === id).map(c => ({ ...c, parentId: nb.parentId }));
  set(s => ({
    notebooks: { ...omit(s.notebooks, [id]), ...byId(children) },
    view: view.type === 'notebook' && view.id === id ? { type: 'unsorted' } : s.view,
    filters: s.filters.notebookId === id ? {} : s.filters,
  }));
  putNotes(moved, true);
  await persist('Das Notizbuch', async () => {
    await repo().saveNotebooks(children);
    await repo().deleteNotebooks([id]);
  });
  return moved.length;
}

// ---------------------------------------------------------------------------
// Schlagwörter

function findTag(name: string) {
  const key = name.trim().toLocaleLowerCase('de');
  return Object.values(get().tags).find(t => t.name.toLocaleLowerCase('de') === key);
}

export async function addTagToNote(noteId: Id, name: string) {
  name = name.trim().replace(/^#/, '');
  if (!name) return;
  let tag = findTag(name);
  if (!tag) {
    tag = { id: newId(), name, createdAt: Date.now() };
    const t = tag;
    set(s => ({ tags: { ...s.tags, [t.id]: t } }));
    await persist('Das Schlagwort', () => repo().saveTags([t]));
  }
  const n = get().notes[noteId];
  if (n && !n.tagIds.includes(tag.id)) patchNote(noteId, { tagIds: [...n.tagIds, tag.id] });
}

export function removeTagFromNote(noteId: Id, tagId: Id) {
  const n = get().notes[noteId];
  if (n) patchNote(noteId, { tagIds: n.tagIds.filter(t => t !== tagId) });
}

export async function renameTag(id: Id, name: string) {
  name = name.trim().replace(/^#/, '');
  const other = findTag(name);
  if (other && other.id !== id) {
    notify(`Es gibt bereits ein Schlagwort „${other.name}“.`, 'error');
    return;
  }
  const tag = { ...get().tags[id], name };
  set(s => ({ tags: { ...s.tags, [id]: tag } }));
  await persist('Das Schlagwort', () => repo().saveTags([tag]));
}

export async function deleteTag(id: Id) {
  const affected = Object.values(get().notes).filter(n => n.tagIds.includes(id)).map(n => ({ ...n, tagIds: n.tagIds.filter(t => t !== id) }));
  set(s => ({
    tags: omit(s.tags, [id]),
    view: s.view.type === 'tag' && s.view.id === id ? { type: 'all' } : s.view,
    filters: s.filters.tagId === id ? {} : s.filters,
  }));
  putNotes(affected, true);
  await persist('Das Schlagwort', () => repo().deleteTags([id]));
}

// ---------------------------------------------------------------------------
// Anhänge

export async function addAttachment(file: File): Promise<Attachment> {
  const meta: Attachment = { id: newId(), name: file.name || 'Datei', mime: file.type || 'application/octet-stream', size: file.size, createdAt: Date.now() };
  await persist('Der Anhang', () => repo().saveAttachment(meta, file));
  set(s => ({ attachments: { ...s.attachments, [meta.id]: meta } }));
  return meta;
}

// ---------------------------------------------------------------------------
// Import & Daten

export async function importJoplin(file: File, onProgress: (msg: string) => void): Promise<ImportStats> {
  await flushSaves();
  const { batch, stats } = await importJex(file, Object.values(get().tags), Object.values(get().notebooks), onProgress);
  // Favoriten/Anheften bleiben bei erneutem Import derselben Notizen erhalten
  const before = get().notes;
  for (const n of batch.notes) if (before[n.id]) Object.assign(n, { favorite: before[n.id].favorite, pinned: before[n.id].pinned });
  await repo().importBatch(batch, (done, total) => onProgress(`Wird gespeichert … ${Math.round((done / Math.max(total, 1)) * 100)} %`));
  forgetAttachmentUrls(batch.attachments.map(a => a.meta.id));
  set(s => ({
    notes: { ...s.notes, ...byId(batch.notes) },
    notebooks: { ...s.notebooks, ...byId(batch.notebooks) },
    tags: { ...s.tags, ...byId(batch.tags) },
    attachments: { ...s.attachments, ...byId(batch.attachments.map(a => a.meta)) },
    view: { type: 'all' },
    filters: {},
    query: '',
    selectedId: null,
  }));
  navigator.storage?.persist?.().catch(() => undefined);
  return stats;
}

export async function deleteAllData() {
  clearTimeout(timer);
  pending.clear();
  await chain;
  await repo().clear();
  forgetAttachmentUrls(Object.keys(get().attachments));
  const settings = { ...DEFAULT_SETTINGS, theme: get().settings.theme, seeded: true };
  await repo().saveSettings(settings);
  set({ notes: {}, notebooks: {}, tags: {}, attachments: {}, settings, view: { type: 'all' }, filters: {}, query: '', selectedId: null, saveState: 'saved' });
}
