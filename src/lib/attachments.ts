import { getRepository } from './storage';
import type { Id } from './types';

/** Anhänge werden im Inhalt als `attachment://<id>` referenziert. */
export const ATTACHMENT_PREFIX = 'attachment://';
/** Verweise auf andere Notizen (z. B. aus Joplin) als `note://<id>`. */
export const NOTE_PREFIX = 'note://';

export const attachmentIdOf = (url: string | null | undefined): Id | null =>
  url && url.startsWith(ATTACHMENT_PREFIX) ? url.slice(ATTACHMENT_PREFIX.length) : null;

const urls = new Map<Id, Promise<string | null>>();

/** Liefert eine (zwischengespeicherte) Objekt-URL für einen Anhang. */
export function attachmentUrl(id: Id): Promise<string | null> {
  let p = urls.get(id);
  if (!p) {
    p = getRepository()
      .getAttachmentBlob(id)
      .then(b => (b ? URL.createObjectURL(b) : null))
      .catch(() => null);
    urls.set(id, p);
  }
  return p;
}

export function forgetAttachmentUrls(ids: Id[]) {
  for (const id of ids) {
    urls.get(id)?.then(u => u && URL.revokeObjectURL(u));
    urls.delete(id);
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
