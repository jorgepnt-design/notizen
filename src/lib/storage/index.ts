import { IndexedDbRepository } from './indexeddb';
import type { NotesRepository } from './repository';

export type { NotesRepository, ImportBatch } from './repository';

let repo: NotesRepository | null = null;

/** Liefert die aktive Datenquelle. Hier lässt sich später eine Sync-Variante einsetzen. */
export function getRepository(): NotesRepository {
  if (!repo) repo = new IndexedDbRepository();
  return repo;
}

export function setRepository(r: NotesRepository) {
  repo = r;
}
