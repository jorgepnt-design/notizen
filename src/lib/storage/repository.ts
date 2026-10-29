import type { Attachment, Id, ItemKind, Note, Notebook, Settings, Snapshot, Tag, Tombstone } from '../types';

export interface ImportBatch {
  notes: Note[];
  notebooks: Notebook[];
  tags: Tag[];
  attachments: { meta: Attachment; blob: Blob }[];
}

/**
 * Einzige Schnittstelle zwischen Oberfläche/Store und der Datenhaltung.
 * Heute steckt IndexedDB dahinter; eine spätere Variante mit Benutzerkonto
 * und Synchronisierung implementiert dieselbe Schnittstelle.
 */
export interface NotesRepository {
  loadAll(): Promise<Snapshot>;

  saveNotes(notes: Note[]): Promise<void>;
  deleteNotes(ids: Id[]): Promise<void>;

  saveNotebooks(notebooks: Notebook[]): Promise<void>;
  deleteNotebooks(ids: Id[]): Promise<void>;

  saveTags(tags: Tag[]): Promise<void>;
  deleteTags(ids: Id[]): Promise<void>;

  saveAttachment(meta: Attachment, blob: Blob): Promise<void>;
  /** Nur Metadaten (z. B. von einem anderen Gerät; die Datei wird bei Bedarf nachgeladen) */
  saveAttachmentMeta(metas: Attachment[]): Promise<void>;
  saveAttachmentBlob(id: Id, blob: Blob): Promise<void>;
  getAttachmentBlob(id: Id): Promise<Blob | null>;
  deleteAttachments(ids: Id[]): Promise<void>;

  /** Löschmarken für die Synchronisierung */
  addTombstones(items: Tombstone[]): Promise<void>;
  getTombstones(): Promise<Tombstone[]>;
  removeTombstones(items: { kind: ItemKind; id: Id }[]): Promise<void>;

  /** Kleine Verwaltungswerte, z. B. der Stand der Synchronisierung */
  getMeta<T>(key: string): Promise<T | null>;
  setMeta<T>(key: string, value: T): Promise<void>;

  saveSettings(settings: Settings): Promise<void>;

  /** Großer Import in mehreren Transaktionen, mit Fortschrittsmeldung. */
  importBatch(batch: ImportBatch, onProgress?: (done: number, total: number) => void): Promise<void>;

  /** Löscht alle Daten auf diesem Gerät. */
  clear(): Promise<void>;
}
