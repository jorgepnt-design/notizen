// Export aller Notizen:
//  • .jex – Joplin-Format; lässt sich in Joplin und wieder in diese App importieren (Sicherung)
//  • Markdown-ZIP – ein Ordner je Notizbuch, eine .md-Datei je Notiz, Anhänge im Ordner „_Anhänge“

import { zipSync, strToU8 } from 'fflate';
import { htmlToMarkdown, safeFileName } from './markdown';
import { getRepository } from './storage';
import { notebookPath } from './query';
import { newId, type Attachment, type Id, type Note, type Notebook, type Tag } from './types';

export interface ExportData {
  notes: Note[];
  notebooks: Record<Id, Notebook>;
  tags: Record<Id, Tag>;
  attachments: Record<Id, Attachment>;
}

export interface ExportResult {
  blob: Blob;
  fileName: string;
  notes: number;
  attachments: number;
}

const today = () => new Date().toISOString().slice(0, 10);
const enc = new TextEncoder();

/** IDs aller Anhänge, die in den Notizen vorkommen */
function usedAttachments(notes: Note[], attachments: Record<Id, Attachment>) {
  const ids = new Set<Id>();
  for (const n of notes) for (const m of n.content.matchAll(/attachment:\/\/([0-9a-zA-Z]+)/g)) if (attachments[m[1]]) ids.add(m[1]);
  return [...ids];
}

const extOf = (a: Attachment) => {
  const fromName = /\.([a-z0-9]{1,10})$/i.exec(a.name)?.[1];
  return (fromName || a.mime.split('/')[1] || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
};

// ---------------------------------------------------------------------------
// .jex (tar-Archiv im Joplin-Rohformat)

function tarHeader(name: string, size: number, mtime: number) {
  const h = new Uint8Array(512);
  const w = (s: string, off: number, len: number) => h.set(enc.encode(s).subarray(0, len), off);
  w(name, 0, 100);
  w('0000644\0', 100, 8);
  w('0000000\0', 108, 8);
  w('0000000\0', 116, 8);
  w(size.toString(8).padStart(11, '0') + '\0', 124, 12);
  w(Math.floor(mtime / 1000).toString(8).padStart(11, '0') + '\0', 136, 12);
  w('        ', 148, 8);
  h[156] = 48;
  w('ustar\0', 257, 6);
  w('00', 263, 2);
  let sum = 0;
  for (const b of h) sum += b;
  w(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return h;
}

const escapeProp = (v: string | number) => String(v).replace(/\n/g, '\\n').replace(/\r/g, '\\r');

function serialize(title: string, body: string, props: Record<string, string | number>) {
  const parts = [escapeProp(title)];
  if (body) parts.push(body);
  parts.push(Object.entries(props).map(([k, v]) => `${k}: ${escapeProp(v)}`).join('\n'));
  return parts.join('\n\n');
}

const iso = (ms: number) => new Date(ms || Date.now()).toISOString();
const times = (created: number, updated = created) => ({
  created_time: iso(created),
  updated_time: iso(updated),
  user_created_time: iso(created),
  user_updated_time: iso(updated),
});
const ENC = { encryption_cipher_text: '', encryption_applied: 0, is_shared: 0 };

export async function exportJex(data: ExportData, onProgress?: (msg: string) => void): Promise<ExportResult> {
  const now = Date.now();
  const parts: BlobPart[] = [];
  const add = (name: string, content: Uint8Array | Blob) => {
    const size = content instanceof Blob ? content.size : content.length;
    parts.push(tarHeader(name, size, now), content as BlobPart);
    const pad = (512 - (size % 512)) % 512;
    if (pad) parts.push(new Uint8Array(pad));
  };
  const item = (id: Id, text: string) => add(`${id}.md`, enc.encode(text));

  const notes = data.notes.filter(n => !n.deletedAt);
  const notebooks = Object.values(data.notebooks);

  // Joplin kennt keine Notizen ohne Notizbuch → Sammel-Notizbuch „Unsortiert“
  const unsortedId = notes.some(n => !n.notebookId || !data.notebooks[n.notebookId]) ? newId() : null;
  if (unsortedId) item(unsortedId, serialize('Unsortiert', '', { id: unsortedId, ...times(now), ...ENC, parent_id: '', type_: 2 }));
  for (const nb of notebooks) {
    const parent = nb.parentId && data.notebooks[nb.parentId] ? nb.parentId : '';
    item(nb.id, serialize(nb.name, '', { id: nb.id, ...times(nb.createdAt, nb.updatedAt), ...ENC, parent_id: parent, type_: 2 }));
  }

  const usedTags = new Set<Id>();
  notes.forEach((n, i) => {
    const body = htmlToMarkdown(n.content, {
      image: id => `:/${id}`,
      attachment: id => `:/${id}`,
      note: id => `:/${id}`,
    });
    item(
      n.id,
      serialize(n.title, body, {
        id: n.id,
        parent_id: n.notebookId && data.notebooks[n.notebookId] ? n.notebookId : unsortedId!,
        ...times(n.createdAt, n.updatedAt),
        is_conflict: 0,
        latitude: '0.00000000',
        longitude: '0.00000000',
        altitude: '0.0000',
        author: '',
        source_url: '',
        is_todo: 0,
        todo_due: 0,
        todo_completed: 0,
        source: 'notizen-by-jorge',
        source_application: 'notizen-by-jorge',
        application_data: '',
        order: 0,
        ...ENC,
        markup_language: 1,
        type_: 1,
      }),
    );
    for (const tagId of n.tagIds) {
      if (!data.tags[tagId]) continue;
      usedTags.add(tagId);
      const linkId = newId();
      item(linkId, serialize('', '', { id: linkId, note_id: n.id, tag_id: tagId, ...times(now), ...ENC, type_: 6 }));
    }
    if (i % 200 === 0) onProgress?.(`${i.toLocaleString('de-DE')} von ${notes.length.toLocaleString('de-DE')} Notizen …`);
  });

  for (const id of usedTags) {
    const t = data.tags[id];
    item(t.id, serialize(t.name, '', { id: t.id, ...times(t.createdAt), ...ENC, parent_id: '', type_: 5 }));
  }

  const files = usedAttachments(notes, data.attachments);
  for (let i = 0; i < files.length; i++) {
    const a = data.attachments[files[i]];
    const blob = await getRepository().getAttachmentBlob(a.id);
    if (!blob) continue;
    const ext = extOf(a);
    item(a.id, serialize(a.name, '', { id: a.id, mime: a.mime, filename: a.name, ...times(a.createdAt), file_extension: ext, ...ENC, encryption_blob_encrypted: 0, size: blob.size, share_id: '', type_: 4 }));
    add(`resources/${a.id}.${ext}`, blob);
    if (i % 20 === 0) onProgress?.(`Anhänge ${i + 1} von ${files.length} …`);
  }
  parts.push(new Uint8Array(1024)); // tar-Ende

  return { blob: new Blob(parts, { type: 'application/x-tar' }), fileName: `notizen-${today()}.jex`, notes: notes.length, attachments: files.length };
}

// ---------------------------------------------------------------------------
// Markdown-ZIP

const yaml = (s: string) => JSON.stringify(s);

export async function exportMarkdownZip(data: ExportData, onProgress?: (msg: string) => void): Promise<ExportResult> {
  const notes = data.notes.filter(n => !n.deletedAt);
  const files: Record<string, Uint8Array> = {};
  const taken = new Set<string>();
  const unique = (path: string) => {
    let p = path;
    for (let i = 2; taken.has(p.toLowerCase()); i++) p = path.replace(/(\.[^.]+)?$/, ` (${i})$1`);
    taken.add(p.toLowerCase());
    return p;
  };

  // Anhänge: _Anhänge/<name>
  const attachmentPath = new Map<Id, string>();
  const ids = usedAttachments(notes, data.attachments);
  for (let i = 0; i < ids.length; i++) {
    const a = data.attachments[ids[i]];
    const blob = await getRepository().getAttachmentBlob(a.id);
    if (!blob) continue;
    const base = safeFileName(a.name.replace(/\.[^.]+$/, '')) + '.' + extOf(a);
    const path = unique(`_Anhänge/${base}`);
    attachmentPath.set(a.id, path);
    files[path] = new Uint8Array(await blob.arrayBuffer());
    if (i % 20 === 0) onProgress?.(`Anhänge ${i + 1} von ${ids.length} …`);
  }

  // Pfade der Notizen vorab festlegen, damit Notizlinks aufgelöst werden können
  const notePath = new Map<Id, string>();
  for (const n of notes) {
    const folder = n.notebookId && data.notebooks[n.notebookId]
      ? notebookPath(n.notebookId, data.notebooks).split(' › ').map(safeFileName).join('/')
      : 'Unsortiert';
    notePath.set(n.id, unique(`${folder}/${safeFileName(n.title)}.md`));
  }

  const relative = (from: string, to: string) => {
    const depth = from.split('/').length - 1;
    return '../'.repeat(depth) + to.split('/').map(encodeURIComponent).join('/');
  };

  notes.forEach((n, i) => {
    const path = notePath.get(n.id)!;
    const body = htmlToMarkdown(n.content, {
      image: id => (attachmentPath.has(id) ? relative(path, attachmentPath.get(id)!) : id),
      attachment: id => (attachmentPath.has(id) ? relative(path, attachmentPath.get(id)!) : id),
      note: id => (notePath.has(id) ? relative(path, notePath.get(id)!) : null),
    });
    const tags = n.tagIds.map(t => data.tags[t]?.name).filter(Boolean) as string[];
    const front = [
      '---',
      `title: ${yaml(n.title || 'Ohne Titel')}`,
      `notebook: ${yaml(n.notebookId ? notebookPath(n.notebookId, data.notebooks) : 'Unsortiert')}`,
      tags.length ? `tags: [${tags.map(yaml).join(', ')}]` : null,
      n.favorite ? 'favorite: true' : null,
      n.pinned ? 'pinned: true' : null,
      `created: ${iso(n.createdAt)}`,
      `updated: ${iso(n.updatedAt)}`,
      '---',
    ].filter(Boolean).join('\n');
    files[path] = strToU8(`${front}\n\n# ${n.title || 'Ohne Titel'}\n\n${body}\n`);
    if (i % 200 === 0) onProgress?.(`${i.toLocaleString('de-DE')} von ${notes.length.toLocaleString('de-DE')} Notizen …`);
  });

  onProgress?.('ZIP-Datei wird erstellt …');
  await new Promise(r => setTimeout(r));
  // Bilder/PDFs sind schon komprimiert – nur Text packen
  const zipped = zipSync(
    // neue Ansicht ohne Kopie: fflate erkennt Dateien per instanceof Uint8Array
    Object.fromEntries(Object.entries(files).map(([p, d]) => [p, [new Uint8Array(d.buffer, d.byteOffset, d.byteLength), { level: p.endsWith('.md') ? 6 : 0 }]])) as Parameters<typeof zipSync>[0],
  );
  return {
    blob: new Blob([zipped as BlobPart], { type: 'application/zip' }),
    fileName: `notizen-markdown-${today()}.zip`,
    notes: notes.length,
    attachments: attachmentPath.size,
  };
}
