import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { DEFAULT_SETTINGS, type Attachment, type Id, type ItemKind, type Note, type Notebook, type Settings, type Tag, type Tombstone } from '../types';
import type { ImportBatch, NotesRepository } from './repository';

interface NotesDB extends DBSchema {
  notes: { key: Id; value: Note };
  notebooks: { key: Id; value: Notebook };
  tags: { key: Id; value: Tag };
  attachments: { key: Id; value: Attachment };
  blobs: { key: Id; value: Blob };
  settings: { key: string; value: Settings };
  tombstones: { key: string; value: Tombstone & { key: string } };
  meta: { key: string; value: unknown };
}

type StoreName = 'notes' | 'notebooks' | 'tags' | 'attachments' | 'blobs' | 'settings' | 'tombstones' | 'meta';
const STORES: StoreName[] = ['notes', 'notebooks', 'tags', 'attachments', 'blobs', 'settings', 'tombstones', 'meta'];
const tombKey = (kind: ItemKind, id: Id) => `${kind}:${id}`;
const CHUNK = 200;

let onBlocked: (() => void) | null = null;
/** Meldet, wenn die Datenbank von einer anderen, noch geöffneten App-Version blockiert wird. */
export function onDatabaseBlocked(fn: () => void) {
  onBlocked = fn;
}

export class IndexedDbRepository implements NotesRepository {
  private db: Promise<IDBPDatabase<NotesDB>>;

  constructor(name = 'notizen') {
    this.db = openDB<NotesDB>(name, 2, {
      upgrade(db) {
        // Fehlende Bereiche anlegen – unabhängig davon, von welchem Stand aus aktualisiert wird
        const ensure = (name: StoreName, keyPath?: string) => {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, keyPath ? { keyPath } : undefined);
        };
        ensure('notes', 'id');
        ensure('notebooks', 'id');
        ensure('tags', 'id');
        ensure('attachments', 'id');
        // Dateien getrennt von den Metadaten, damit der Start nicht alle Anhänge lädt
        ensure('blobs');
        ensure('settings');
        // für die Synchronisierung
        ensure('tombstones', 'key');
        ensure('meta');
      },
      // Eine ältere Version der App ist noch in einem anderen Tab geöffnet und hält die Datenbank fest
      blocked: () => onBlocked?.(),
      // Eine neuere Version will die Datenbank umbauen: Verbindung freigeben und neu laden
      blocking(_current, _next, event) {
        (event.target as IDBDatabase).close();
        location.reload();
      },
    });
  }

  async loadAll() {
    const db = await this.db;
    const [notes, notebooks, tags, attachments, settings] = await Promise.all([
      db.getAll('notes'),
      db.getAll('notebooks'),
      db.getAll('tags'),
      db.getAll('attachments'),
      db.get('settings', 'app'),
    ]);
    return { notes, notebooks, tags, attachments, settings: { ...DEFAULT_SETTINGS, ...settings } };
  }

  private async putAll<S extends 'notes' | 'notebooks' | 'tags' | 'attachments'>(store: S, items: NotesDB[S]['value'][]) {
    if (!items.length) return;
    const db = await this.db;
    const tx = db.transaction(store, 'readwrite');
    await Promise.all([...items.map(i => tx.store.put(i)), tx.done]);
  }

  private async deleteAll(store: StoreName, ids: Id[]) {
    if (!ids.length) return;
    const db = await this.db;
    const tx = db.transaction(store, 'readwrite');
    await Promise.all([...ids.map(id => tx.store.delete(id)), tx.done]);
  }

  saveNotes = (notes: Note[]) => this.putAll('notes', notes);
  deleteNotes = (ids: Id[]) => this.deleteAll('notes', ids);
  saveNotebooks = (nbs: Notebook[]) => this.putAll('notebooks', nbs);
  deleteNotebooks = (ids: Id[]) => this.deleteAll('notebooks', ids);
  saveTags = (tags: Tag[]) => this.putAll('tags', tags);
  deleteTags = (ids: Id[]) => this.deleteAll('tags', ids);

  async saveAttachment(meta: Attachment, blob: Blob) {
    const db = await this.db;
    const tx = db.transaction(['attachments', 'blobs'], 'readwrite');
    await Promise.all([tx.objectStore('attachments').put(meta), tx.objectStore('blobs').put(blob, meta.id), tx.done]);
  }

  saveAttachmentMeta = (metas: Attachment[]) => this.putAll('attachments', metas);

  async saveAttachmentBlob(id: Id, blob: Blob) {
    await (await this.db).put('blobs', blob, id);
  }

  async addTombstones(items: Tombstone[]) {
    if (!items.length) return;
    const db = await this.db;
    const tx = db.transaction('tombstones', 'readwrite');
    await Promise.all([...items.map(t => tx.store.put({ ...t, key: tombKey(t.kind, t.id) })), tx.done]);
  }

  async getTombstones() {
    return (await (await this.db).getAll('tombstones')).map(({ kind, id, changedAt }) => ({ kind, id, changedAt }));
  }

  async removeTombstones(items: { kind: ItemKind; id: Id }[]) {
    await this.deleteAll('tombstones', items.map(t => tombKey(t.kind, t.id)));
  }

  async getMeta<T>(key: string) {
    return ((await (await this.db).get('meta', key)) as T | undefined) ?? null;
  }

  async setMeta<T>(key: string, value: T) {
    await (await this.db).put('meta', value, key);
  }

  async getAttachmentBlob(id: Id) {
    return (await (await this.db).get('blobs', id)) ?? null;
  }

  async deleteAttachments(ids: Id[]) {
    await this.deleteAll('attachments', ids);
    await this.deleteAll('blobs', ids);
  }

  async saveSettings(settings: Settings) {
    await (await this.db).put('settings', settings, 'app');
  }

  async importBatch(batch: ImportBatch, onProgress?: (done: number, total: number) => void) {
    const db = await this.db;
    const total = batch.attachments.length + batch.notes.length + batch.notebooks.length + batch.tags.length;
    let done = 0;
    const tick = (n: number) => { done += n; onProgress?.(done, total); };

    // Anhänge in kleinen Portionen – sehr große Transaktionen brechen in Safari ab.
    for (let i = 0; i < batch.attachments.length; i += 20) {
      const part = batch.attachments.slice(i, i + 20);
      const tx = db.transaction(['attachments', 'blobs'], 'readwrite');
      await Promise.all([
        ...part.flatMap(a => [tx.objectStore('attachments').put(a.meta), tx.objectStore('blobs').put(a.blob, a.meta.id)]),
        tx.done,
      ]);
      tick(part.length);
    }
    await this.putAll('notebooks', batch.notebooks);
    tick(batch.notebooks.length);
    await this.putAll('tags', batch.tags);
    tick(batch.tags.length);
    for (let i = 0; i < batch.notes.length; i += CHUNK) {
      const part = batch.notes.slice(i, i + CHUNK);
      await this.putAll('notes', part);
      tick(part.length);
    }
  }

  async clear() {
    const db = await this.db;
    const tx = db.transaction(STORES, 'readwrite');
    await Promise.all([...STORES.map(s => tx.objectStore(s).clear()), tx.done]);
  }
}
