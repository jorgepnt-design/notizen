// Import von Joplin-Exporten (.jex).
//
// Eine .jex-Datei ist ein tar-Archiv. Jedes Element (Notiz, Notizbuch, Schlagwort,
// Notiz↔Schlagwort-Verknüpfung, Anhang-Metadaten) liegt als „<id>.md“ im
// Joplin-Rohformat vor; die Anhänge selbst unter „resources/<id>.<endung>“.
//
// Rohformat: Titel, Leerzeile, Inhalt, Leerzeile, dann Zeilen „schlüssel: wert“.
// Gelesen wird von unten: Eigenschaften bis zur ersten Leerzeile, der Rest ist Titel + Inhalt.

import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { htmlToText } from '../html';
import { ATTACHMENT_PREFIX, NOTE_PREFIX } from '../attachments';
import type { ImportBatch } from '../storage';
import { newId, type Attachment, type Note, type Notebook, type Tag } from '../types';
import { looksLikeTar, readTar } from './tar';

export const JOPLIN_TYPE = { NOTE: 1, FOLDER: 2, RESOURCE: 4, TAG: 5, NOTE_TAG: 6 } as const;

export interface JoplinItem {
  type: number;
  title: string;
  body: string;
  props: Record<string, string>;
}

export interface ImportStats {
  notes: number;
  notebooks: number;
  tags: number;
  attachments: number;
  trashed: number;
  skippedEncrypted: number;
  missingAttachments: number;
}

const unescape = (s: string) => s.replace(/\\n/g, '\n').replace(/\\r/g, '\r');

export function parseJoplinItem(text: string): JoplinItem | null {
  const lines = text.split('\n');
  const props: Record<string, string> = {};
  let i = lines.length - 1;
  for (; i >= 0; i--) {
    const line = lines[i].trim();
    if (line === '') {
      if (!Object.keys(props).length) continue; // abschließende Leerzeilen tolerieren
      break;
    }
    const p = line.indexOf(':');
    if (p < 0) return null;
    props[line.slice(0, p).trim()] = unescape(line.slice(p + 1).trim());
  }
  if (!props.type_ || !props.id) return null;
  const head = i > 0 ? lines.slice(0, i) : [];
  return {
    type: Number(props.type_),
    title: unescape((head[0] ?? '').replace(/\r$/, '')),
    body: head.slice(2).join('\n'),
    props,
  };
}

/** Zeitangaben sind ISO-Texte, manche Felder (todo_*, deleted_time) Millisekunden. */
export function joplinTime(v: string | undefined): number {
  if (!v) return 0;
  if (/^\d+$/.test(v)) return Number(v);
  const n = Date.parse(v);
  return isNaN(n) ? 0 : n;
}

const LINK_RE = /^:\/([0-9a-fA-F]{32})/;

/** Joplin-Inhalt (Markdown oder HTML) in das HTML des Editors umwandeln. */
export function joplinBodyToHtml(body: string, isHtml: boolean, resourceIds: Set<string>): { html: string; missing: number } {
  const raw = isHtml ? body : (marked.parse(body, { gfm: true, breaks: true, async: false }) as string);
  const clean = DOMPurify.sanitize(raw, { FORBID_TAGS: ['style', 'script', 'iframe', 'form'], FORBID_ATTR: ['style'] });
  const doc = new DOMParser().parseFromString(clean, 'text/html');
  let missing = 0;

  doc.querySelectorAll('img').forEach(img => {
    const m = LINK_RE.exec(img.getAttribute('src') || '');
    if (!m) return;
    if (resourceIds.has(m[1])) {
      img.removeAttribute('src');
      img.setAttribute('data-src', ATTACHMENT_PREFIX + m[1]);
    } else {
      missing++;
      img.replaceWith(doc.createTextNode(`[Bild fehlt: ${img.getAttribute('alt') || m[1]}]`));
    }
  });
  doc.querySelectorAll('a').forEach(a => {
    const m = LINK_RE.exec(a.getAttribute('href') || '');
    if (!m) return;
    a.setAttribute('href', (resourceIds.has(m[1]) ? ATTACHMENT_PREFIX : NOTE_PREFIX) + m[1]);
  });

  // GFM-Aufgabenlisten in das Checklisten-Format des Editors bringen
  doc.querySelectorAll('ul, ol').forEach(list => {
    const items = Array.from(list.children).filter(c => c.tagName === 'LI');
    const boxes = items.map(li => li.querySelector(':scope > input[type=checkbox], :scope > p:first-child > input[type=checkbox]'));
    if (!items.length || boxes.some(b => !b)) return;
    const ul = doc.createElement('ul');
    ul.setAttribute('data-type', 'taskList');
    items.forEach((li, idx) => {
      const box = boxes[idx] as HTMLInputElement;
      const checked = box.hasAttribute('checked');
      box.remove();
      const item = doc.createElement('li');
      item.setAttribute('data-type', 'taskItem');
      item.setAttribute('data-checked', String(checked));
      const hasBlock = Array.from(li.children).some(c => /^(P|UL|OL|PRE|BLOCKQUOTE|H\d)$/.test(c.tagName));
      if (hasBlock) item.innerHTML = li.innerHTML;
      else item.innerHTML = `<p>${li.innerHTML.trim()}</p>`;
      ul.appendChild(item);
    });
    list.replaceWith(ul);
  });

  return { html: doc.body.innerHTML, missing };
}

export async function importJex(
  file: Blob,
  existingTags: Tag[],
  existingNotebooks: Notebook[],
  onProgress: (msg: string) => void = () => undefined,
): Promise<{ batch: ImportBatch; stats: ImportStats }> {
  onProgress('Datei wird gelesen …');
  const u8 = new Uint8Array(await file.arrayBuffer());
  if (!looksLikeTar(u8)) {
    throw new Error('Das ist keine gültige .jex-Datei. Exportiere in Joplin über „Datei → Exportieren → JEX – Joplin Export File“.');
  }

  const dec = new TextDecoder();
  const items: JoplinItem[] = [];
  const files = new Map<string, Uint8Array>();
  let skippedEncrypted = 0;
  let count = 0;

  for (const entry of readTar(u8)) {
    const base = entry.name.split('/').pop() || '';
    if (/(^|\/)resources\//.test(entry.name)) {
      files.set(base.split('.')[0], entry.data);
      continue;
    }
    if (!base.endsWith('.md')) continue;
    const item = parseJoplinItem(dec.decode(entry.data));
    if (!item) continue;
    if (item.props.encryption_applied === '1') {
      skippedEncrypted++;
      continue;
    }
    items.push(item);
    if (++count % 500 === 0) {
      onProgress(`${count.toLocaleString('de-DE')} Einträge gelesen …`);
      await new Promise(r => setTimeout(r));
    }
  }

  const of = (t: number) => items.filter(i => i.type === t);
  const now = Date.now();
  const created = (p: Record<string, string>) => joplinTime(p.user_created_time) || joplinTime(p.created_time) || now;
  const updated = (p: Record<string, string>) => joplinTime(p.user_updated_time) || joplinTime(p.updated_time) || created(p);

  // Anhänge
  const attachments: ImportBatch['attachments'] = [];
  for (const r of of(JOPLIN_TYPE.RESOURCE)) {
    const data = files.get(r.props.id);
    if (!data) continue;
    const ext = r.props.file_extension ? `.${r.props.file_extension}` : '';
    const name = r.props.filename || (r.title && /\.\w+$/.test(r.title) ? r.title : `${r.title || r.props.id}${ext}`);
    const mime = r.props.mime || 'application/octet-stream';
    const meta: Attachment = { id: r.props.id, name, mime, size: data.length, createdAt: created(r.props) };
    attachments.push({ meta, blob: new Blob([data as BlobPart], { type: mime }) });
  }
  const resourceIds = new Set(attachments.map(a => a.meta.id));

  // Notizbücher (aus Joplins Papierkorb gelöschte werden nicht übernommen)
  const folders = of(JOPLIN_TYPE.FOLDER).filter(f => !joplinTime(f.props.deleted_time));
  const folderIds = new Set([...folders.map(f => f.props.id), ...existingNotebooks.map(n => n.id)]);
  const notebooks: Notebook[] = folders.map(f => ({
    id: f.props.id,
    name: f.title || 'Ohne Namen',
    parentId: f.props.parent_id && folderIds.has(f.props.parent_id) ? f.props.parent_id : null,
    createdAt: created(f.props),
    updatedAt: updated(f.props),
  }));

  // Schlagwörter: gleichnamige vorhandene wiederverwenden statt doppelt anlegen
  const byName = new Map(existingTags.map(t => [t.name.toLocaleLowerCase('de'), t]));
  const tags: Tag[] = [];
  const tagIdMap = new Map<string, string>();
  const tagFor = (name: string, joplinId?: string) => {
    const key = name.toLocaleLowerCase('de');
    let tag = byName.get(key);
    if (!tag) {
      tag = { id: joplinId || newId(), name, createdAt: now };
      byName.set(key, tag);
      tags.push(tag);
    }
    if (joplinId) tagIdMap.set(joplinId, tag.id);
    return tag.id;
  };
  for (const t of of(JOPLIN_TYPE.TAG)) if (t.title.trim()) tagFor(t.title.trim(), t.props.id);

  const noteTags = new Map<string, Set<string>>();
  for (const nt of of(JOPLIN_TYPE.NOTE_TAG)) {
    const tagId = tagIdMap.get(nt.props.tag_id);
    if (!tagId) continue;
    if (!noteTags.has(nt.props.note_id)) noteTags.set(nt.props.note_id, new Set());
    noteTags.get(nt.props.note_id)!.add(tagId);
  }

  // Notizen
  onProgress('Notizen werden umgewandelt …');
  let missingAttachments = 0;
  let trashed = 0;
  const notes: Note[] = [];
  for (const n of of(JOPLIN_TYPE.NOTE)) {
    const p = n.props;
    const { html, missing } = joplinBodyToHtml(n.body, p.markup_language === '2', resourceIds);
    missingAttachments += missing;
    const tagIds = noteTags.get(p.id) ?? new Set<string>();
    if (p.is_todo === '1') tagIds.add(tagFor(joplinTime(p.todo_completed) ? 'Erledigt' : 'Aufgabe'));
    const deletedAt = joplinTime(p.deleted_time) || null;
    if (deletedAt) trashed++;
    notes.push({
      id: p.id,
      title: n.title,
      content: html,
      text: htmlToText(html),
      notebookId: p.parent_id && folderIds.has(p.parent_id) ? p.parent_id : null,
      tagIds: [...tagIds],
      favorite: false,
      pinned: false,
      createdAt: created(p),
      updatedAt: updated(p),
      deletedAt,
    });
    if (notes.length % 300 === 0) {
      onProgress(`${notes.length.toLocaleString('de-DE')} Notizen umgewandelt …`);
      await new Promise(r => setTimeout(r));
    }
  }

  if (!notes.length && !notebooks.length) {
    throw new Error(
      skippedEncrypted
        ? 'Alle Einträge dieser Datei sind verschlüsselt. Deaktiviere in Joplin die Ende-zu-Ende-Verschlüsselung und exportiere erneut.'
        : 'In dieser Datei wurden keine Joplin-Notizen gefunden.',
    );
  }

  return {
    batch: { notes, notebooks, tags, attachments },
    stats: {
      notes: notes.length,
      notebooks: notebooks.length,
      tags: tagIdMap.size,
      attachments: attachments.length,
      trashed,
      skippedEncrypted,
      missingAttachments,
    },
  };
}
