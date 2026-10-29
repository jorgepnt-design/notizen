import { getRepository } from './storage';
import type { Id } from './types';

/** Anhänge werden im Inhalt als `attachment://<id>` referenziert. */
export const ATTACHMENT_PREFIX = 'attachment://';
/** Verweise auf andere Notizen (z. B. aus Joplin) als `note://<id>`. */
export const NOTE_PREFIX = 'note://';

export const attachmentIdOf = (url: string | null | undefined): Id | null =>
  url && url.startsWith(ATTACHMENT_PREFIX) ? url.slice(ATTACHMENT_PREFIX.length) : null;

type RemoteFetcher = (id: Id) => Promise<Blob | null>;
let remoteFetcher: RemoteFetcher | null = null;

/** Die Synchronisierung meldet hier, wie fehlende Dateien aus der Cloud geholt werden. */
export function setRemoteAttachmentFetcher(fn: RemoteFetcher | null) {
  remoteFetcher = fn;
}

/** Datei eines Anhangs: zuerst lokal, sonst (angemeldet) aus der Cloud – und dann lokal zwischengespeichert. */
export async function loadAttachmentBlob(id: Id): Promise<Blob | null> {
  const local = await getRepository().getAttachmentBlob(id);
  if (local || !remoteFetcher) return local;
  const remote = await remoteFetcher(id).catch(() => null);
  if (remote) await getRepository().saveAttachmentBlob(id, remote).catch(() => undefined);
  return remote;
}

const urls = new Map<Id, Promise<string | null>>();

/** Liefert eine (zwischengespeicherte) Objekt-URL für einen Anhang. */
export function attachmentUrl(id: Id): Promise<string | null> {
  let p = urls.get(id);
  if (!p) {
    p = loadAttachmentBlob(id)
      .then(b => (b ? URL.createObjectURL(b) : null))
      .catch(() => null);
    urls.set(id, p);
    // Nicht gefunden: später erneut versuchen (z. B. nach der Anmeldung)
    void p.then(u => u === null && urls.get(id) === p && urls.delete(id));
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
