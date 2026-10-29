import TurndownService from 'turndown';
import { tables, strikethrough } from 'turndown-plugin-gfm';
import { NOTE_PREFIX, attachmentIdOf, blobToDataUrl } from './attachments';
import { getRepository } from './storage';
import type { Attachment, Id, Note } from './types';

function createTurndown() {
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*' });
  td.use([tables, strikethrough]);
  // Checklisten des Editors: <li data-type="taskItem" data-checked="true">
  td.addRule('taskItem', {
    filter: node => node.nodeName === 'LI' && (node as HTMLElement).getAttribute('data-type') === 'taskItem',
    replacement: (content, node) => {
      const checked = (node as HTMLElement).getAttribute('data-checked') === 'true';
      const text = content.replace(/^\n+/, '').replace(/\n+$/, '').replace(/\n/gm, '\n    ');
      return `- [${checked ? 'x' : ' '}] ${text}\n`;
    },
  });
  td.addRule('taskCheckboxLabel', {
    filter: node => node.nodeName === 'LABEL' && !!node.parentElement?.getAttribute('data-type'),
    replacement: () => '',
  });
  return td;
}

let turndown: TurndownService | null = null;

export interface LinkMapper {
  /** Ziel für ein Bild aus dem Anhangspeicher */
  image: (id: Id) => string;
  /** Ziel für einen verlinkten Anhang */
  attachment: (id: Id) => string;
  /** Ziel für einen Link auf eine andere Notiz; `null` entfernt den Link */
  note: (id: Id) => string | null;
}

/** Notiz-HTML in Markdown umwandeln; Anhänge und Notizlinks bestimmt `map`. */
export function htmlToMarkdown(html: string, map: LinkMapper): string {
  const doc = new DOMParser().parseFromString(html || '', 'text/html');
  doc.querySelectorAll('img').forEach(img => {
    const id = attachmentIdOf(img.getAttribute('data-src') || img.getAttribute('src'));
    if (!id) return;
    img.removeAttribute('data-src');
    img.setAttribute('src', map.image(id));
  });
  doc.querySelectorAll('a').forEach(a => {
    const href = a.getAttribute('href') || '';
    const id = attachmentIdOf(href);
    if (id) a.setAttribute('href', map.attachment(id));
    else if (href.startsWith(NOTE_PREFIX)) {
      const target = map.note(href.slice(NOTE_PREFIX.length));
      if (target) a.setAttribute('href', target);
      else a.removeAttribute('href');
    }
  });
  turndown ??= createTurndown();
  return turndown.turndown(doc.body.innerHTML).trim();
}

export const safeFileName = (s: string) => (s || 'Ohne Titel').replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Ohne Titel';

/**
 * Wandelt eine einzelne Notiz in Markdown um. Bilder werden als Data-URI
 * eingebettet, damit die Datei für sich allein vollständig ist.
 */
export async function noteToMarkdown(note: Note, attachments: Record<Id, Attachment>): Promise<string> {
  const dataUrls = new Map<Id, string>();
  for (const m of note.content.matchAll(/attachment:\/\/([0-9a-zA-Z]+)/g)) {
    if (dataUrls.has(m[1]) || !attachments[m[1]]?.mime.startsWith('image/')) continue;
    const blob = await getRepository().getAttachmentBlob(m[1]);
    if (blob && blob.size <= 8 * 1024 * 1024) dataUrls.set(m[1], await blobToDataUrl(blob));
  }
  const body = htmlToMarkdown(note.content, {
    image: id => dataUrls.get(id) ?? attachments[id]?.name ?? id,
    attachment: id => attachments[id]?.name ?? id,
    note: () => null,
  });
  return `# ${note.title || 'Ohne Titel'}\n\n${body}\n`;
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadNoteAsMarkdown(note: Note, attachments: Record<Id, Attachment>) {
  const md = await noteToMarkdown(note, attachments);
  downloadBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${safeFileName(note.title)}.md`);
}
