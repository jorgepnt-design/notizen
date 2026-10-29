import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { DEFAULT_SETTINGS, type Attachment, type Id, type Note, type Notebook, type Settings, type Tag } from '../types';
import type { ImportBatch, NotesRepository } from './repository';

interface NotesDB extends DBSchema {
  notes: { key: Id; value: Note };
  notebooks: { key: Id; value: Notebook };
  tags: { key: Id; value: Tag };
  attachments: { key: Id; value: Attachment };
  blobs: { key: Id; value: Blob };
  settings: { key: string; value: Settings };
}

type StoreName = 'notes' | 'notebooks' | 'tags' | 'attachments' | 'blobs' | 'settings';
const STORES: StoreName[] = ['notes', 'notebooks', 'tags', 'attachments', 'blobs', 'settings'];
const CHUNK = 200;

export class IndexedDbRepository implements NotesRepository {
  private db: Promise<IDBPDatabase<NotesDB>>;

  constructor(name = 'notizen') {
    this.db = openDB<NotesDB>(name, 1, {
      upgrade(db) {
        db.createObjectStore('notes', { keyPath: 'id' });
        db.createObjectStore('notebooks', { keyPath: 'id' });
        db.createObjectStore('tags', { keyPath: 'id' });
        db.createObjectStore('attachments', { keyPath: 'id' });
        // Dateien getrennt von den Metadaten, damit der Start nicht alle Anhänge lädt
        db.createObjectStore('blobs');
        db.createObjectStore('settings');
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
