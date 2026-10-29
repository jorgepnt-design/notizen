import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { syncOnce, type LocalData, type RemoteChanges, type SyncHost } from '@/lib/sync/engine';
import { IndexedDbRepository } from '@/lib/storage/indexeddb';
import { setRepository } from '@/lib/storage';
import type { Id, Note, Tombstone } from '@/lib/types';

// ---- Nachgebauter Server: Tabellen + Storage mit derselben Regel wie der Trigger nz_touch ----

type Row = Record<string, unknown> & { id: string; user_id: string; changed_at: number; server_updated_at: string };

function fakeServer() {
  const tables: Record<string, Map<string, Row>> = {};
  const files = new Map<string, Blob>();
  let clock = Date.parse('2026-01-01T00:00:00Z');
  const tick = () => new Date((clock += 1000)).toISOString();

  const db = {
    from(table: string) {
      const t = (tables[table] ??= new Map());
      let since: string | null = null;
      let range: [number, number] = [0, 999];
      const query = {
        select: () => query,
        order: () => query,
        gt: (_c: string, v: string) => ((since = v), query),
        range: (a: number, b: number) => ((range = [a, b]), query),
        then: (resolve: (r: { data: Row[]; error: null }) => void) => {
          const rows = [...t.values()]
            .filter(r => !since || r.server_updated_at > since)
            .sort((a, b) => a.server_updated_at.localeCompare(b.server_updated_at))
            .slice(range[0], range[1] + 1);
          resolve({ data: rows.map(r => ({ ...r })), error: null });
        },
        upsert: async (batch: Row[]) => {
          for (const r of batch) {
            const k = `${r.user_id}:${r.id}`;
            const old = t.get(k);
            if (old && r.changed_at < old.changed_at) continue; // älterer Stand wird ignoriert
            t.set(k, { ...old, ...r, server_updated_at: tick() });
          }
          return { error: null };
        },
      };
      return query;
    },
    storage: {
      from: () => ({
        upload: async (path: string, blob: Blob) => (files.set(path, blob), { error: null }),
        download: async (path: string) => (files.has(path) ? { data: files.get(path)!, error: null } : { data: null, error: new Error('fehlt') }),
        remove: async (paths: string[]) => (paths.forEach(p => files.delete(p)), { error: null }),
      }),
    },
  };
  return { db: db as unknown as SupabaseClient, tables, files };
}

// ---- Ein „Gerät“: eigener lokaler Speicher + einfacher Zustand ----

let deviceSeq = 0;
function device(seedIds: Id[] = []) {
  const repo = new IndexedDbRepository(`test-geraet-${++deviceSeq}`);
  const state: LocalData = { notes: [], notebooks: [], tags: [], attachments: [] };
  const host: SyncHost = {
    local: async () => ({ notes: [...state.notes], notebooks: [...state.notebooks], tags: [...state.tags], attachments: [...state.attachments] }),
    apply: async (ch: RemoteChanges) => {
      const merge = <T extends { id: Id }>(list: T[], incoming: T[], kind: string) => {
        const gone = new Set(ch.deleted.filter(d => d.kind === kind).map(d => d.id));
        const m = new Map(list.map(x => [x.id, x]));
        incoming.forEach(x => m.set(x.id, x));
        return [...m.values()].filter(x => !gone.has(x.id));
      };
      state.notes = merge(state.notes, ch.notes, 'note');
      state.notebooks = merge(state.notebooks, ch.notebooks, 'notebook');
      state.tags = merge(state.tags, ch.tags, 'tag');
      state.attachments = merge(state.attachments, ch.attachments, 'attachment');
    },
    seedIds: () => seedIds,
  };
  let t = 1_000;
  const write = (n: Partial<Note> & { id: Id }) => {
    t += 10;
    const old = state.notes.find(x => x.id === n.id);
    const next: Note = { title: '', content: '', text: '', notebookId: null, tagIds: [], favorite: false, pinned: false, createdAt: t, updatedAt: t, deletedAt: null, ...old, ...n, changedAt: Date.now() };
    state.notes = [...state.notes.filter(x => x.id !== n.id), next];
  };
  const remove = async (id: Id) => {
    state.notes = state.notes.filter(x => x.id !== id);
    await repo.addTombstones([{ kind: 'note', id, changedAt: Date.now() } as Tombstone]);
  };
  const sync = (db: SupabaseClient) => {
    setRepository(repo);
    return syncOnce(db, 'user-1', host);
  };
  const title = (id: Id) => state.notes.find(n => n.id === id)?.title;
  return { state, write, remove, sync, title, repo };
}

describe('Synchronisierung zwischen zwei Geräten', () => {
  it('überträgt neue Notizen, Änderungen und Löschungen in beide Richtungen', async () => {
    const { db } = fakeServer();
    const a = device();
    const b = device();

    a.write({ id: 'n1', title: 'Von A' });
    await a.sync(db);
    await b.sync(db);
    expect(b.title('n1')).toBe('Von A');

    await new Promise(r => setTimeout(r, 5));
    b.write({ id: 'n1', title: 'Von B geändert' });
    b.write({ id: 'n2', title: 'Neu auf B' });
    await b.sync(db);
    await a.sync(db);
    expect(a.title('n1')).toBe('Von B geändert');
    expect(a.title('n2')).toBe('Neu auf B');

    await new Promise(r => setTimeout(r, 5));
    await a.remove('n2');
    await a.sync(db);
    await b.sync(db);
    expect(b.title('n2')).toBeUndefined();
    expect(await a.repo.getTombstones()).toEqual([]);
  });

  it('bei gleichzeitiger Bearbeitung gewinnt der neuere Stand – auf beiden Geräten', async () => {
    const { db } = fakeServer();
    const a = device();
    const b = device();
    a.write({ id: 'n1', title: 'Start' });
    await a.sync(db);
    await b.sync(db);

    a.write({ id: 'n1', title: 'A (älter)' });
    await new Promise(r => setTimeout(r, 5));
    b.write({ id: 'n1', title: 'B (neuer)' });
    await b.sync(db);
    await a.sync(db); // A schickt seinen älteren Stand – der Server behält B
    await b.sync(db);
    await a.sync(db);
    expect(a.title('n1')).toBe('B (neuer)');
    expect(b.title('n1')).toBe('B (neuer)');
  });

  it('erkennt danach keine Änderungen mehr (kein Hin und Her)', async () => {
    const { db } = fakeServer();
    const a = device();
    const b = device();
    a.write({ id: 'n1', title: 'X' });
    await a.sync(db);
    await b.sync(db);
    const again = await b.sync(db);
    expect(again).toEqual({ pulled: 0, pushed: 0 });
  });

  it('schickt bei vorgehender Uhr eines Geräts nichts doppelt', async () => {
    const { db } = fakeServer();
    const a = device();
    const b = device();
    a.write({ id: 'n1', title: 'X' });
    a.state.notes[0].changedAt = Date.now() + 3_600_000; // Uhr von A geht eine Stunde vor
    await a.sync(db);
    await b.sync(db);
    expect(await b.sync(db)).toEqual({ pulled: 0, pushed: 0 });
    expect(await a.sync(db)).toEqual({ pulled: 0, pushed: 0 });
  });

  it('entfernt unveränderte Beispielnotizen bei der ersten Anmeldung, wenn das Konto schon Notizen hat', async () => {
    const { db, tables } = fakeServer();
    const a = device();
    a.write({ id: 'echt', title: 'Echte Notiz' });
    await a.sync(db);

    const b = device(['beispiel']);
    b.state.notes.push({ id: 'beispiel', title: 'Willkommen', content: '', text: '', notebookId: null, tagIds: [], favorite: false, pinned: false, createdAt: 5, updatedAt: 5, deletedAt: null });
    await b.sync(db);
    expect(b.title('beispiel')).toBeUndefined();
    expect(b.title('echt')).toBe('Echte Notiz');
    expect([...tables.nz_notes.values()].map(r => r.id)).toEqual(['echt']);
  });

  it('lädt Dateien von Anhängen hoch und löscht sie mit', async () => {
    const { db, files } = fakeServer();
    const a = device();
    await a.repo.saveAttachment({ id: 'bild', name: 'foto.png', mime: 'image/png', size: 3, createdAt: 1 }, new Blob(['abc']));
    a.state.attachments.push({ id: 'bild', name: 'foto.png', mime: 'image/png', size: 3, createdAt: 1, changedAt: Date.now() });
    await a.sync(db);
    expect(files.has('user-1/bild')).toBe(true);

    a.state.attachments = [];
    await a.repo.addTombstones([{ kind: 'attachment', id: 'bild', changedAt: Date.now() + 1000 }]);
    await a.sync(db);
    expect(files.has('user-1/bild')).toBe(false);
  });
});
