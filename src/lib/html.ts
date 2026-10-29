const BLOCK = /^(P|DIV|H[1-6]|LI|BLOCKQUOTE|PRE|TR|BR|HR|UL|OL|TABLE|SECTION|ARTICLE)$/;

/** Wandelt Notiz-HTML in reinen Text um (Absätze bleiben als Zeilenumbrüche erhalten). */
export function htmlToText(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push(node.textContent || '');
      return;
    }
    if (!(node instanceof Element)) return;
    if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE') return;
    node.childNodes.forEach(walk);
    if (BLOCK.test(node.tagName)) out.push('\n');
  };
  walk(doc.body);
  return out
    .join('')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function previewText(text: string, max = 180): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
