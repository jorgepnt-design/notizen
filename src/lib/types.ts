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
}

export interface Notebook {
  id: Id;
  name: string;
  parentId: Id | null;
  createdAt: number;
  updatedAt: number;
}

export interface Tag {
  id: Id;
  name: string;
  createdAt: number;
}

/** Metadaten einer angehängten Datei; die Datei selbst liegt getrennt als Blob. */
export interface Attachment {
  id: Id;
  name: string;
  mime: string;
  size: number;
  createdAt: number;
}

export type SortKey = 'updated' | 'created' | 'title';
export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  theme: Theme;
  sort: SortKey;
  /** Beispielnotizen wurden bereits einmal angelegt */
  seeded: boolean;
}

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
