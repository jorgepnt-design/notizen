import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { attachmentIdOf, attachmentUrl } from '@/lib/attachments';

/**
 * Bild-Knoten, der `attachment://<id>` aus IndexedDB auflöst. Solche Bilder stehen im
 * gespeicherten HTML als `data-src`, damit der Browser nicht versucht, die
 * unbekannte Adresse selbst zu laden.
 */
const AttachmentImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
        parseHTML: el => el.getAttribute('data-src') || el.getAttribute('src'),
        renderHTML: attrs => (attachmentIdOf(attrs.src) ? { 'data-src': attrs.src } : { src: attrs.src }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'img[src]' }, { tag: 'img[data-src]' }];
  },
  addNodeView() {
    return ({ node }) => {
      const img = document.createElement('img');
      let current = '';
      const apply = (n: typeof node) => {
        const src = String(n.attrs.src || '');
        img.alt = n.attrs.alt || '';
        if (n.attrs.title) img.title = n.attrs.title;
        if (src === current) return;
        current = src;
        const id = attachmentIdOf(src);
        if (!id) {
          img.src = src;
          return;
        }
        img.removeAttribute('src');
        void attachmentUrl(id).then(url => {
          if (current !== src) return;
          if (url) img.src = url;
          else img.alt = `Bild nicht gefunden (${img.alt || id})`;
        });
      };
      apply(node);
      return {
        dom: img,
        update: n => {
          if (n.type.name !== 'image') return false;
          apply(n);
          return true;
        },
      };
    };
  },
});

export function buildExtensions() {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      protocols: ['attachment', 'note'],
      HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
    }),
    AttachmentImage.configure({ inline: true, allowBase64: true }),
    Placeholder.configure({ placeholder: 'Schreib los …' }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
  ];
}
