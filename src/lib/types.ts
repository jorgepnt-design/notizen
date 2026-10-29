export type Id = string;

export interface Note {
  id: Id;
  title: string;
  /** Inhalt als HTML (Format des Rich-Text-Editors) */
  content: string;
  /** Reiner Text für Suche und Vorschau, wird beim Speichern aus `content` abgeleitet */
  text: string;
  /** `null` = Unsortiert */
  notebookId: Id | null;
  tagIds: Id[];
  favorite: boolean;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  /** gesetzt = liegt im Papierkorb */
  deletedAt: number | null;
  /** Zeitpunkt der letzten Änderung jeglicher Art (für die Synchronisierung: neuester Stand gewinnt) */
  changedAt?: number;
}

export interface Notebook {
  id: Id;
  name: string;
  parentId: Id | null;
  createdAt: number;
  updatedAt: number;
  changedAt?: number;
}

export interface Tag {
  id: Id;
  name: string;
  createdAt: number;
  changedAt?: number;
}

/** Metadaten einer angehängten Datei; die Datei selbst liegt getrennt als Blob. */
export interface Attachment {
  id: Id;
  name: string;
  mime: string;
  size: number;
  createdAt: number;
  changedAt?: number;
}

export type SortKey = 'updated' | 'created' | 'title';
export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  theme: Theme;
  sort: SortKey;
  /** Beispielnotizen wurden bereits einmal angelegt */
  seeded: boolean;
  /** IDs der Beispielinhalte – werden bei der ersten Synchronisierung mit einem gefüllten Konto entfernt */
  seedIds?: Id[];
}

export type ItemKind = 'note' | 'notebook' | 'tag' | 'attachment';

/** Löschmarke: sorgt dafür, dass eine Löschung auch auf anderen Geräten ankommt */
export interface Tombstone {
  kind: ItemKind;
  id: Id;
  changedAt: number;
}

/** Zeitpunkt der letzten Änderung, auch für ältere Datensätze ohne changedAt */
export const changedAtOf = (x: { changedAt?: number; updatedAt?: number; createdAt: number }) => x.changedAt ?? x.updatedAt ?? x.createdAt;

export const DEFAULT_SETTINGS: Settings = { theme: 'system', sort: 'updated', seeded: false };

export interface Snapshot {
  notes: Note[];
  notebooks: Notebook[];
  tags: Tag[];
  attachments: Attachment[];
  settings: Settings;
}

export const newId = (): Id =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '')
    : Math.random().toString(16).slice(2) + Date.now().toString(16);
