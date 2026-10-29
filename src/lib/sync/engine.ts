// Abgleich zwischen dem lokalen Speicher (IndexedDB) und der Cloud (Supabase).
//
// Ablauf je Durchgang:
//  1. Abrufen: alles, was der Server seit dem letzten Abruf neu bekommen hat.
//     Pro Datensatz gewinnt der neuere Stand (changedAt); Löschmarken entfernen lokal.
//  2. Senden: alles, was sich lokal seit dem letzten Senden geändert hat, plus Löschmarken.
//     Dateien von Anhängen werden vorher in den Storage hochgeladen.
// Der Server lässt einen älteren Stand nie einen neueren überschreiben (Trigger nz_touch).

import type { SupabaseClient } from '@supabase/supabase-js';
import { htmlToText } from '../html';
import { getRepository } from '../storage';
import { changedAtOf, type Attachment, type Id, type ItemKind, type Note, type Notebook, type Tag, type Tombstone } from '../types';
import { ATTACHMENT_BUCKET } from './client';

export interface LocalData {
  notes: Note[];
  notebooks: Notebook[];
  tags: Tag[];
  attachments: Attachment[];
}

export interface RemoteChanges extends LocalData {
  deleted: { kind: ItemKind; id: Id }[];
}

/** Schnittstelle zum Anwendungszustand (implementiert im Store) */
export interface SyncHost {
  /** Aktueller lokaler Stand (ausstehende Speichervorgänge vorher abschließen) */
  local(): Promise<LocalData>;
  /** Änderungen von anderen Geräten übernehmen (ohne neue Zeitstempel) */
  apply(changes: RemoteChanges): Promise<void>;
  /** IDs der Beispielinhalte dieses Geräts */
  seedIds(): Id[];
}

interface SyncMeta {
  userId: string;
  lastPull: string | null;
  /** je Datensatz der zuletzt abgeglichene Stand (changedAt) – unabhängig von der Uhr des Geräts */
  synced: Record<string, number>;
}

const TABLE: Record<ItemKind, string> = { note: 'nz_notes', notebook: 'nz_notebooks', tag: 'nz_tags', attachment: 'nz_attachments' };
const KINDS: ItemKind[] = ['notebook', 'tag', 'attachment', 'note'];
const PAGE = 1000;
/** Überlappung beim Abruf, damit gleichzeitig eingetroffene Änderungen nicht verloren gehen */
const OVERLAP_MS = 60_000;

type Row = Record<string, unknown> & { id: string; changed_at: number; deleted: boolean; server_updated_at: string };

// ---- Umwandlung lokal ↔ Tabellenzeile ----

const toRow = {
  note: (n: Note) => ({
    id: n.id, title: n.title, content: n.content, notebook_id: n.notebookId, tag_ids: n.tagIds, favorite: n.favorite, pinned: n.pinned,
    created_at: n.createdAt, updated_at: n.updatedAt, deleted_at: n.deletedAt, changed_at: changedAtOf(n), deleted: false,
  }),
  notebook: (n: Notebook) => ({ id: n.id, name: n.name, parent_id: n.parentId, created_at: n.createdAt, updated_at: n.updatedAt, changed_at: changedAtOf(n), deleted: false }),
  tag: (t: Tag) => ({ id: t.id, name: t.name, created_at: t.createdAt, changed_at: changedAtOf(t), deleted: false }),
  attachment: (a: Attachment) => ({ id: a.id, name: a.name, mime: a.mime, size: a.size, created_at: a.createdAt, changed_at: changedAtOf(a), deleted: false }),
};

const num = (v: unknown) => Number(v) || 0;

const fromRow = {
  note: (r: Row): Note => {
    const content = String(r.content ?? '');
    return {
      id: r.id, title: String(r.title ?? ''), content, text: htmlToText(content), notebookId: (r.notebook_id as string) || null,
      tagIds: (r.tag_ids as string[]) ?? [], favorite: !!r.favorite, pinned: !!r.pinned, createdAt: num(r.created_at), updatedAt: num(r.updated_at),
      deletedAt: r.deleted_at == null ? null : num(r.deleted_at), changedAt: num(r.changed_at),
    };
  },
  notebook: (r: Row): Notebook => ({ id: r.id, name: String(r.name ?? ''), parentId: (r.parent_id as string) || null, createdAt: num(r.created_at), updatedAt: num(r.updated_at), changedAt: num(r.changed_at) }),
  tag: (r: Row): Tag => ({ id: r.id, name: String(r.name ?? ''), createdAt: num(r.created_at), changedAt: num(r.changed_at) }),
  attachment: (r: Row): Attachment => ({ id: r.id, name: String(r.name ?? ''), mime: String(r.mime ?? 'application/octet-stream'), size: num(r.size), createdAt: num(r.created_at), changedAt: num(r.changed_at) }),
};

const key = (kind: ItemKind, id: Id) => `${kind}:${id}`;

async function pull(db: SupabaseClient, kind: ItemKind, since: string | null): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = db.from(TABLE[kind]).select('*').order('server_updated_at').range(from, from + PAGE - 1);
    if (since) q = q.gt('server_updated_at', since);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE) return rows;
  }
}

/** Zeilen in Portionen senden; Notizen nach Größe, damit einzelne Anfragen nicht zu groß werden */
async function push(db: SupabaseClient, kind: ItemKind, rows: Record<string, unknown>[], userId: string) {
  let batch: Record<string, unknown>[] = [];
  let size = 0;
  const send = async () => {
    if (!batch.length) return;
    const { error } = await db.from(TABLE[kind]).upsert(batch, { onConflict: 'user_id,id' });
    if (error) throw error;
    batch = [];
    size = 0;
  };
  for (const r of rows) {
    batch.push({ ...r, user_id: userId });
    size += JSON.stringify(r).length;
    if (batch.length >= 200 || size > 2_000_000) await send();
  }
  await send();
}

export interface SyncResult {
  pulled: number;
  pushed: number;
}

export async function syncOnce(db: SupabaseClient, userId: string, host: SyncHost, onProgress?: (msg: string) => void): Promise<SyncResult> {
  const repo = getRepository();
  const stored = await repo.getMeta<SyncMeta>('sync');
  const meta: SyncMeta = stored && stored.userId === userId && stored.synced ? stored : { userId, lastPull: null, synced: {} };
  const synced = meta.synced;
  const firstSync = !meta.lastPull;

  // ---- 1. Abrufen ----
  onProgress?.('Änderungen werden abgerufen …');
  const since = meta.lastPull ? new Date(Date.parse(meta.lastPull) - OVERLAP_MS).toISOString() : null;
  const remote = {} as Record<ItemKind, Row[]>;
  let maxServer = meta.lastPull;
  for (const kind of KINDS) {
    remote[kind] = await pull(db, kind, since);
    for (const r of remote[kind]) if (!maxServer || r.server_updated_at > maxServer) maxServer = r.server_updated_at;
  }

  const local = await host.local();
  const tombstones = await repo.getTombstones();
  const localChanged = new Map<string, number>();
  for (const n of local.notes) localChanged.set(key('note', n.id), changedAtOf(n));
  for (const n of local.notebooks) localChanged.set(key('notebook', n.id), changedAtOf(n));
  for (const t of local.tags) localChanged.set(key('tag', t.id), changedAtOf(t));
  for (const a of local.attachments) localChanged.set(key('attachment', a.id), changedAtOf(a));
  for (const t of tombstones) localChanged.set(key(t.kind, t.id), Math.max(localChanged.get(key(t.kind, t.id)) ?? 0, t.changedAt));

  const changes: RemoteChanges = { notes: [], notebooks: [], tags: [], attachments: [], deleted: [] };
  /** Datensätze, die gerade vom Server kamen – nicht gleich wieder zurückschicken */
  const fromServer = new Map<string, number>();
  for (const kind of KINDS) {
    for (const r of remote[kind]) {
      const k = key(kind, r.id);
      const local = localChanged.get(k) ?? -1;
      if (num(r.changed_at) === local) synced[k] = local; // bereits gleich
      if (num(r.changed_at) <= local) continue;
      fromServer.set(k, num(r.changed_at));
      if (r.deleted) changes.deleted.push({ kind, id: r.id });
      else if (kind === 'note') changes.notes.push(fromRow.note(r));
      else if (kind === 'notebook') changes.notebooks.push(fromRow.notebook(r));
      else if (kind === 'tag') changes.tags.push(fromRow.tag(r));
      else changes.attachments.push(fromRow.attachment(r));
    }
  }

  // Erste Anmeldung auf diesem Gerät und das Konto hat schon Notizen:
  // unveränderte Beispielnotizen nicht ins Konto übertragen, sondern hier entfernen.
  const skip = new Set<string>();
  if (firstSync && remote.note.some(r => !r.deleted)) {
    const seeds = new Set(host.seedIds());
    const untouchedNotes = local.notes.filter(n => seeds.has(n.id) && n.updatedAt === n.createdAt);
    const remaining = local.notes.filter(n => !untouchedNotes.includes(n));
    const drop = (kind: ItemKind, id: Id) => {
      changes.deleted.push({ kind, id });
      skip.add(key(kind, id));
    };
    untouchedNotes.forEach(n => drop('note', n.id));
    local.notebooks.filter(nb => seeds.has(nb.id) && !remaining.some(n => n.notebookId === nb.id)).forEach(nb => drop('notebook', nb.id));
    local.tags.filter(t => seeds.has(t.id) && !remaining.some(n => n.tagIds.includes(t.id))).forEach(t => drop('tag', t.id));
  }

  const pulled = changes.notes.length + changes.notebooks.length + changes.tags.length + changes.attachments.length + changes.deleted.length - skip.size;
  if (pulled + skip.size > 0) await host.apply(changes);

  for (const [k, c] of fromServer) synced[k] = c;
  for (const d of changes.deleted) delete synced[key(d.kind, d.id)];

  // ---- 2. Senden ----
  const now = await host.local();
  const due = <T extends { id: Id; changedAt?: number; updatedAt?: number; createdAt: number }>(kind: ItemKind, items: T[]) =>
    items.filter(x => {
      const k = key(kind, x.id);
      return !skip.has(k) && synced[k] !== changedAtOf(x);
    });

  const out = {
    notebook: due('notebook', now.notebooks),
    tag: due('tag', now.tags),
    attachment: due('attachment', now.attachments),
    note: due('note', now.notes),
  };
  let pushed = 0;

  // Dateien der Anhänge zuerst hochladen; fehlt eine lokal (nie heruntergeladen), nur die Metadaten senden
  for (let i = 0; i < out.attachment.length; i++) {
    const a = out.attachment[i];
    const blob = await repo.getAttachmentBlob(a.id);
    if (blob) {
      onProgress?.(`Anhänge werden hochgeladen … ${i + 1} / ${out.attachment.length}`);
      const { error } = await db.storage.from(ATTACHMENT_BUCKET).upload(`${userId}/${a.id}`, blob, { upsert: true, contentType: a.mime });
      if (error) throw error;
    }
  }
  onProgress?.('Änderungen werden gesendet …');
  await push(db, 'notebook', out.notebook.map(toRow.notebook), userId);
  await push(db, 'tag', out.tag.map(toRow.tag), userId);
  await push(db, 'attachment', out.attachment.map(toRow.attachment), userId);
  await push(db, 'note', out.note.map(toRow.note), userId);
  pushed += out.notebook.length + out.tag.length + out.attachment.length + out.note.length;
  for (const kind of KINDS) for (const x of out[kind]) synced[key(kind, x.id)] = changedAtOf(x);

  // Löschmarken
  const tombs = (await repo.getTombstones()).filter(t => !skip.has(key(t.kind, t.id)));
  for (const kind of KINDS) {
    const list = tombs.filter(t => t.kind === kind);
    if (!list.length) continue;
    await push(db, kind, list.map(t => tombstoneRow(kind, t)), userId);
    if (kind === 'attachment') await db.storage.from(ATTACHMENT_BUCKET).remove(list.map(t => `${userId}/${t.id}`));
  }
  await repo.removeTombstones(tombs);
  for (const t of tombs) delete synced[key(t.kind, t.id)];
  pushed += tombs.length;

  await repo.setMeta<SyncMeta>('sync', { userId, lastPull: maxServer, synced });
  return { pulled, pushed };
}

function tombstoneRow(kind: ItemKind, t: Tombstone) {
  const base = { id: t.id, created_at: 0, changed_at: t.changedAt, deleted: true };
  if (kind === 'note') return { ...base, updated_at: 0, title: '', content: '', tag_ids: [] };
  if (kind === 'notebook') return { ...base, updated_at: 0, name: '' };
  if (kind === 'tag') return { ...base, name: '' };
  return { ...base, name: '', size: 0 };
}

/** Lädt die Datei eines Anhangs aus dem Storage */
export async function downloadAttachment(db: SupabaseClient, userId: string, id: Id): Promise<Blob | null> {
  const { data, error } = await db.storage.from(ATTACHMENT_BUCKET).download(`${userId}/${id}`);
  return error ? null : data;
}
