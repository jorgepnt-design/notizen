import { describe, expect, it } from 'vitest';
import { importJex, joplinBodyToHtml, parseJoplinItem } from '@/lib/jex/joplin';
import { compareNotes, matchesQuery, notebookPath, selectNotes } from '@/lib/query';
import type { Note } from '@/lib/types';

// ---- kleiner tar-Schreiber, um Joplin-Exporte nachzubauen ----
const enc = new TextEncoder();
function tar(files: Record<string, string | Uint8Array>): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const [name, content] of Object.entries(files)) {
    const data = typeof content === 'string' ? enc.encode(content) : content;
    const h = new Uint8Array(512);
    const w = (s: string, off: number) => h.set(enc.encode(s), off);
    w(name, 0);
    w('0000644\0', 100);
    w('0000000\0', 108);
    w('0000000\0', 116);
    w(data.length.toString(8).padStart(11, '0') + '\0', 124);
    w('00000000000\0', 136);
    w('        ', 148);
    h[156] = 48;
    w('ustar\0', 257);
    w('00', 263);
    let sum = 0;
    h.forEach(b => (sum += b));
    w(sum.toString(8).padStart(6, '0') + '\0 ', 148);
    parts.push(h, data, new Uint8Array((512 - (data.length % 512)) % 512));
  }
  parts.push(new Uint8Array(1024));
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}
const asBlob = (u8: Uint8Array) => ({ arrayBuffer: async () => u8.buffer }) as unknown as Blob;

const id = (n: number) => n.toString(16).padStart(32, '0');
const FOLDER = id(1), SUB = id(2), NOTE = id(3), HTMLNOTE = id(4), TAG = id(5), RES = id(6), TODO = id(7);

const sample = () =>
  tar({
    [`${FOLDER}.md`]: `Arbeit\n\nid: ${FOLDER}\ncreated_time: 2024-01-01T10:00:00.000Z\nupdated_time: 2024-01-02T10:00:00.000Z\nparent_id: \ntype_: 2`,
    [`${SUB}.md`]: `Projekte\n\nid: ${SUB}\ncreated_time: 2024-01-01T10:00:00.000Z\nupdated_time: 2024-01-02T10:00:00.000Z\nparent_id: ${FOLDER}\ntype_: 2`,
    [`${NOTE}.md`]: `Einkaufsliste\n\n## Heute\n\n- [x] Milch\n- [ ] Brot\n\n![Foto](:/${RES})\n\n[Andere Notiz](:/${HTMLNOTE})\n\nid: ${NOTE}\nparent_id: ${SUB}\ncreated_time: 2024-02-01T08:00:00.000Z\nupdated_time: 2024-02-03T08:00:00.000Z\nuser_created_time: 2024-02-01T08:00:00.000Z\nuser_updated_time: 2024-02-03T08:00:00.000Z\nis_todo: 0\nmarkup_language: 1\ntype_: 1`,
    [`${HTMLNOTE}.md`]: `Aus Evernote\n\n<div><b>Fett</b> und <script>alert(1)</script>normal</div>\n\nid: ${HTMLNOTE}\nparent_id: ${FOLDER}\ncreated_time: 2023-05-01T08:00:00.000Z\nupdated_time: 2023-05-01T08:00:00.000Z\nmarkup_language: 2\ntype_: 1`,
    [`${TODO}.md`]: `Steuer machen\n\nid: ${TODO}\nparent_id: gibtsnicht\ncreated_time: 2023-05-01T08:00:00.000Z\nupdated_time: 2023-05-01T08:00:00.000Z\nis_todo: 1\ntodo_completed: 0\ntype_: 1`,
    [`${TAG}.md`]: `Einkauf\n\nid: ${TAG}\ncreated_time: 2024-01-01T10:00:00.000Z\ntype_: 5`,
    [`${id(8)}.md`]: `id: ${id(8)}\nnote_id: ${NOTE}\ntag_id: ${TAG}\ntype_: 6`,
    [`${RES}.md`]: `foto.png\n\nid: ${RES}\nmime: image/png\nfilename: foto.png\nfile_extension: png\nsize: 4\ntype_: 4`,
    [`resources/${RES}.png`]: new Uint8Array([137, 80, 78, 71]),
  });

describe('Joplin-Rohformat', () => {
  it('liest Titel, Inhalt und Eigenschaften', () => {
    const item = parseJoplinItem('Titel\n\nZeile 1\n\nZeile 2\n\nid: abc\ntype_: 1\n');
    expect(item).toMatchObject({ type: 1, title: 'Titel', body: 'Zeile 1\n\nZeile 2', props: { id: 'abc' } });
  });
  it('wandelt Aufgabenlisten in Editor-Checklisten', () => {
    const { html } = joplinBodyToHtml('- [x] a\n- [ ] b', false, new Set());
    expect(html).toContain('data-type="taskList"');
    expect(html).toContain('data-checked="true"');
    expect(html).toContain('data-checked="false"');
    expect(html).not.toContain('<input');
  });
});

describe('importJex', () => {
  it('übernimmt Notizbücher, Notizen, Schlagwörter und Anhänge', async () => {
    const { batch, stats } = await importJex(asBlob(sample()), [], []);
    expect(stats).toMatchObject({ notes: 3, notebooks: 2, attachments: 1 });
    expect(batch.notebooks.find(n => n.id === SUB)?.parentId).toBe(FOLDER);

    const note = batch.notes.find(n => n.id === NOTE)!;
    expect(note.notebookId).toBe(SUB);
    expect(note.content).toContain(`data-src="attachment://${RES}"`);
    expect(note.content).not.toContain(` src="attachment:`);
    expect(note.content).toContain(`href="note://${HTMLNOTE}"`);
    expect(note.text).toContain('Milch');
    expect(note.updatedAt).toBe(Date.parse('2024-02-03T08:00:00.000Z'));
    expect(note.tagIds).toEqual([TAG]);

    const html = batch.notes.find(n => n.id === HTMLNOTE)!;
    expect(html.content).toContain('<b>Fett</b>');
    expect(html.content).not.toContain('script');

    const todo = batch.notes.find(n => n.id === TODO)!;
    expect(todo.notebookId).toBeNull(); // unbekanntes Notizbuch → Unsortiert
    expect(batch.tags.find(t => todo.tagIds.includes(t.id))?.name).toBe('Aufgabe');
  });

  it('verwendet gleichnamige vorhandene Schlagwörter wieder', async () => {
    const existing = { id: 'mein-tag', name: 'einkauf', createdAt: 0 };
    const { batch } = await importJex(asBlob(sample()), [existing], []);
    expect(batch.notes.find(n => n.id === NOTE)!.tagIds).toEqual(['mein-tag']);
    expect(batch.tags.some(t => t.name.toLowerCase() === 'einkauf')).toBe(false);
  });

  it('lehnt Dateien ab, die kein tar-Archiv sind', async () => {
    await expect(importJex(asBlob(enc.encode('hallo')), [], [])).rejects.toThrow(/keine gültige \.jex-Datei/);
  });
});

describe('Suche und Sortierung', () => {
  const base = { content: '', notebookId: null, tagIds: [] as string[], favorite: false, pinned: false, deletedAt: null };
  const notes: Note[] = [
    { ...base, id: 'a', title: 'Zebra', text: 'Streifen', createdAt: 1, updatedAt: 5 },
    { ...base, id: 'b', title: 'Apfel', text: 'Obst rot', createdAt: 3, updatedAt: 2 },
    { ...base, id: 'c', title: 'Mango', text: 'Obst', createdAt: 2, updatedAt: 1, pinned: true },
    { ...base, id: 'd', title: 'Alt', text: 'weg', createdAt: 0, updatedAt: 0, deletedAt: 9 },
  ];
  it('findet über Titel und Inhalt, ohne Groß/Klein', () => {
    expect(matchesQuery(notes[1], 'obst ROT')).toBe(true);
    expect(matchesQuery(notes[0], 'obst')).toBe(false);
  });
  it('sortiert angeheftete Notizen nach oben', () => {
    expect([...notes].sort(compareNotes('title')).map(n => n.id)).toEqual(['c', 'd', 'b', 'a']);
  });
  it('trennt Papierkorb und aktive Notizen', () => {
    expect(selectNotes(notes, {}, { type: 'all' }, '', {}, 'updated').map(n => n.id)).toEqual(['c', 'a', 'b']);
    expect(selectNotes(notes, {}, { type: 'trash' }, '', {}, 'updated').map(n => n.id)).toEqual(['d']);
    expect(selectNotes(notes, {}, { type: 'all' }, 'obst', {}, 'updated').map(n => n.id)).toEqual(['c', 'b']);
  });
  it('baut Notizbuch-Pfade', () => {
    const nbs = { p: { id: 'p', name: 'Arbeit', parentId: null, createdAt: 0, updatedAt: 0 }, k: { id: 'k', name: 'Projekte', parentId: 'p', createdAt: 0, updatedAt: 0 } };
    expect(notebookPath('k', nbs)).toBe('Arbeit › Projekte');
    expect(notebookPath(null, nbs)).toBe('Unsortiert');
  });
});
