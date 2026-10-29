import type { Note } from './types';

/** WhatsApp nimmt über wa.me nur begrenzt lange Texte zuverlässig an */
const MAX_LENGTH = 4000;

/**
 * Notiz in WhatsApp-Text umwandeln: *fett*, _kursiv_, ~durchgestrichen~, ```Code```,
 * Aufzählungen mit „•“, Checklisten mit ☐/☑.
 */
export function noteToWhatsApp(note: Note): string {
  const doc = new DOMParser().parseFromString(note.content || '', 'text/html');

  const inline = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent || '').replace(/\s+/g, ' ');
    if (!(node instanceof Element)) return '';
    const inner = Array.from(node.childNodes).map(inline).join('');
    const wrap = (m: string) => (inner.trim() ? `${m}${inner.trim()}${m}` : inner);
    switch (node.tagName) {
      case 'STRONG':
      case 'B':
        return wrap('*');
      case 'EM':
      case 'I':
        return wrap('_');
      case 'S':
      case 'DEL':
        return wrap('~');
      case 'CODE':
        return wrap('`');
      case 'BR':
        return '\n';
      case 'IMG':
        return '[Bild]';
      case 'A': {
        const href = node.getAttribute('href') || '';
        return /^https?:/.test(href) && href !== inner ? `${inner} (${href})` : inner;
      }
      default:
        return inner;
    }
  };

  const block = (el: Element, indent = ''): string[] => {
    const out: string[] = [];
    for (const child of Array.from(el.children)) {
      switch (child.tagName) {
        case 'H1':
        case 'H2':
        case 'H3':
          out.push('', `*${inline(child).trim()}*`);
          break;
        case 'UL':
        case 'OL': {
          const task = child.getAttribute('data-type') === 'taskList';
          Array.from(child.children).forEach((li, i) => {
            const mark = task ? (li.getAttribute('data-checked') === 'true' ? '☑' : '☐') : child.tagName === 'OL' ? `${i + 1}.` : '•';
            const text = Array.from(li.childNodes)
              .filter(n => !(n instanceof Element && /^(UL|OL|LABEL)$/.test(n.tagName)))
              .map(inline)
              .join(' ')
              .replace(/\s+/g, ' ')
              .trim();
            out.push(`${indent}${mark} ${text}`);
            for (const sub of Array.from(li.querySelectorAll(':scope > ul, :scope > ol, :scope > div > ul'))) {
              const wrapper = doc.createElement('div');
              wrapper.appendChild(sub.cloneNode(true));
              out.push(...block(wrapper, indent + '   '));
            }
          });
          break;
        }
        case 'BLOCKQUOTE':
          out.push(...block(child).map(l => (l ? `> ${l}` : l)));
          break;
        case 'PRE':
          out.push('```' + (child.textContent || '').replace(/\n$/, '') + '```');
          break;
        case 'TABLE':
          for (const tr of Array.from(child.querySelectorAll('tr')))
            out.push(Array.from(tr.children).map(c => inline(c).trim()).join(' | '));
          break;
        case 'HR':
          out.push('———');
          break;
        case 'DIV':
          out.push(...block(child, indent));
          break;
        default: {
          const t = inline(child).trim();
          if (t) out.push(t);
        }
      }
    }
    return out;
  };

  const body = block(doc.body).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const text = [note.title ? `*${note.title}*` : '', body].filter(Boolean).join('\n\n');
  return text.length > MAX_LENGTH ? text.slice(0, MAX_LENGTH - 1) + '…' : text;
}

export function shareViaWhatsApp(note: Note) {
  const url = `https://wa.me/?text=${encodeURIComponent(noteToWhatsApp(note))}`;
  window.open(url, '_blank', 'noopener');
}

export const canShareNatively = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

/** Teilen über das System-Menü (iPhone/Android: WhatsApp, Mail, Nachrichten …) */
export async function shareNatively(note: Note): Promise<boolean> {
  try {
    await navigator.share({ title: note.title || 'Notiz', text: noteToWhatsApp(note) });
    return true;
  } catch (e) {
    // Abbruch durch den Nutzer ist kein Fehler
    return e instanceof DOMException && e.name === 'AbortError';
  }
}
