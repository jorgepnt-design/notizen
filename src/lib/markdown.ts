import TurndownService from 'turndown';
import { tables, strikethrough } from 'turndown-plugin-gfm';
import { attachmentIdOf, blobToDataUrl } from './attachments';
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

const safeName = (s: string) => (s || 'Notiz').replace(/[\\/:*?"<>|\n\r]+/g, ' ').trim().slice(0, 80) || 'Notiz';

/**
 * Wandelt eine Notiz in Markdown um. Bilder aus dem Anhangspeicher werden als
 * Data-URI eingebettet, damit die Datei für sich allein vollständig ist.
 */
export async function noteToMarkdown(note: Note, attachments: Record<Id, Attachment>): Promise<string> {
  const doc = new DOMParser().parseFromString(note.content || '', 'text/html');
  for (const img of Array.from(doc.querySelectorAll('img'))) {
    const id = attachmentIdOf(img.getAttribute('data-src') || img.getAttribute('src'));
    if (!id) continue;
    img.removeAttribute('data-src');
    const blob = await getRepository().getAttachmentBlob(id);
    if (blob && blob.size <= 8 * 1024 * 1024) img.setAttribute('src', await blobToDataUrl(blob));
    else img.setAttribute('src', attachments[id]?.name || id);
  }
  doc.querySelectorAll('a').forEach(a => {
    const id = attachmentIdOf(a.getAttribute('href'));
    if (id) a.setAttribute('href', attachments[id]?.name || id);
    else if ((a.getAttribute('href') || '').startsWith('note://')) a.removeAttribute('href');
  });
  const body = createTurndown().turndown(doc.body.innerHTML).trim();
  return `# ${note.title || 'Ohne Titel'}\n\n${body}\n`;
}

export async function downloadNoteAsMarkdown(note: Note, attachments: Record<Id, Attachment>) {
  const md = await noteToMarkdown(note, attachments);
  const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName(note.title)}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
