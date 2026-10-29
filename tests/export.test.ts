import { beforeAll, describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { exportJex, exportMarkdownZip, type ExportData } from '@/lib/export';
import { importJex } from '@/lib/jex/joplin';
import { setRepository, type NotesRepository } from '@/lib/storage';
import type { Note } from '@/lib/types';
import { Blob as NodeBlob } from 'node:buffer';

// jsdom-Blob kennt arrayBuffer() nicht – im Browser gibt es das; hier Nodes Blob verwenden
globalThis.Blob = NodeBlob as unknown as typeof Blob;

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

beforeAll(() => {
  // Nur getAttachmentBlob wird beim Export gebraucht
  setRepository({ getAttachmentBlob: async (id: string) => (id === 'a'.repeat(32) ? new Blob([PNG], { type: 'image/png' }) : null) } as unknown as NotesRepository);
});

const IMG = 'a'.repeat(32);
const NB = 'b'.repeat(32);
const SUB = 'c'.repeat(32);
const TAG = 'd'.repeat(32);
const note = (id: string, extra: Partial<Note>): Note => ({
  id, title: '', content: '', text: '', notebookId: null, tagIds: [], favorite: false, pinned: false, createdAt: 1_700_000_000_000, updatedAt: 1_700_000_100_000, deletedAt: null, ...extra,
});

const data: ExportData = {
  notes: [
    note('1'.repeat(32), {
      title: 'Rezept',
      notebookId: SUB,
      tagIds: [TAG],
      favorite: true,
      content: `<h2>Zutaten</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Mehl</p></li><li data-type="taskItem" data-checked="false"><p>Zucker</p></li></ul><p><img data-src="attachment://${IMG}" alt="Foto"></p><p><a href="note://${'2'.repeat(32)}">Einkauf</a></p>`,
    }),
    note('2'.repeat(32), { title: 'Einkauf', content: '<p><strong>Brot</strong> holen</p>' }),
    note('3'.repeat(32), { title: 'Weg', content: '<p>gelöscht</p>', deletedAt: 5 }),
  ],
  notebooks: {
    [NB]: { id: NB, name: 'Küche', parentId: null, createdAt: 1, updatedAt: 1 },
    [SUB]: { id: SUB, name: 'Kuchen', parentId: NB, createdAt: 1, updatedAt: 1 },
  },
  tags: { [TAG]: { id: TAG, name: 'Backen', createdAt: 1 } },
  attachments: { [IMG]: { id: IMG, name: 'foto.png', mime: 'image/png', size: PNG.length, createdAt: 1 } },
};

async function bytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

describe('Export als .jex', () => {
  it('lässt sich ohne Verlust wieder importieren', async () => {
    const res = await exportJex(data);
    expect(res.notes).toBe(2);
    expect(res.attachments).toBe(1);
    const u8 = await bytes(res.blob);
    const { batch } = await importJex({ arrayBuffer: async () => u8.buffer } as unknown as Blob, [], []);

    const r = batch.notes.find(n => n.title === 'Rezept')!;
    expect(r.notebookId).toBe(SUB);
    expect(r.tagIds).toEqual([TAG]);
    expect(r.content).toContain('data-checked="true"');
    expect(r.content).toContain(`data-src="attachment://${IMG}"`);
    expect(r.content).toContain(`href="note://${'2'.repeat(32)}"`);
    expect(r.createdAt).toBe(1_700_000_000_000);

    const e = batch.notes.find(n => n.title === 'Einkauf')!;
    expect(e.content).toContain('<strong>Brot</strong>');
    expect(batch.notebooks.find(n => n.name === 'Unsortiert')?.id).toBe(e.notebookId);
    expect(batch.notebooks.find(n => n.id === SUB)?.parentId).toBe(NB);
    expect(batch.attachments[0].meta).toMatchObject({ id: IMG, mime: 'image/png' });
    expect(batch.notes.some(n => n.title === 'Weg')).toBe(false);
  });
});

describe('Export als Markdown-ZIP', () => {
  it('legt Ordner je Notizbuch, Anhänge und relative Links an', async () => {
    const res = await exportMarkdownZip(data);
    const files = unzipSync(await bytes(res.blob));
    expect(Object.keys(files).sort()).toEqual(['Küche/Kuchen/Rezept.md', 'Unsortiert/Einkauf.md', '_Anhänge/foto.png']);
    const md = strFromU8(files['Küche/Kuchen/Rezept.md']);
    expect(md).toContain('tags: ["Backen"]');
    expect(md).toContain('favorite: true');
    expect(md).toContain('- [x] Mehl');
    expect(md).toContain('![Foto](../../_Anh%C3%A4nge/foto.png)');
    expect(md).toContain('[Einkauf](../../Unsortiert/Einkauf.md)');
    expect(files['_Anhänge/foto.png']).toEqual(PNG);
  });
});
