'use client';

// Steuerung von Anmeldung und Synchronisierung.
// Ohne Anmeldung bleibt alles lokal; nach der Anmeldung wird automatisch abgeglichen:
// beim Start, nach lokalen Änderungen, bei Änderungen auf anderen Geräten (Realtime),
// wenn die Seite wieder sichtbar oder online wird und zusätzlich jede Minute.

import { create } from 'zustand';
import type { RealtimeChannel, Session } from '@supabase/supabase-js';
import { setRemoteAttachmentFetcher } from '../attachments';
import { isGoogleEnabled, supabase } from './client';
import { downloadAttachment, syncOnce, type SyncHost } from './engine';

export interface SyncUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

interface SyncState {
  /** null = noch nicht geprüft */
  user: SyncUser | null;
  authReady: boolean;
  googleEnabled: boolean | null;
  status: 'idle' | 'syncing' | 'error' | 'offline';
  progress: string | null;
  lastSyncAt: number | null;
  error: string | null;
}

export const useSync = create<SyncState>(() => ({
  user: null,
  authReady: false,
  googleEnabled: null,
  status: 'idle',
  progress: null,
  lastSyncAt: null,
  error: null,
}));

const set = useSync.setState;
let host: SyncHost | null = null;
let channel: RealtimeChannel | null = null;
let running: Promise<void> | null = null;
let again = false;
let debounce: ReturnType<typeof setTimeout> | undefined;
let interval: ReturnType<typeof setInterval> | undefined;
let onRemoteApplied: ((n: number) => void) | null = null;

function toUser(session: Session | null): SyncUser | null {
  const u = session?.user;
  if (!u) return null;
  const m = u.user_metadata ?? {};
  return {
    id: u.id,
    email: u.email ?? '',
    name: (m.full_name as string) || (m.name as string) || u.email || 'Angemeldet',
    avatarUrl: (m.avatar_url as string) || (m.picture as string) || null,
  };
}

/** Einmal beim Start aufrufen. `afterPull` meldet, wie viele Änderungen von anderen Geräten kamen. */
export function initSync(h: SyncHost, afterPull?: (n: number) => void) {
  if (host) return;
  host = h;
  onRemoteApplied = afterPull ?? null;
  const db = supabase();

  // Fehler aus der Rückleitung von Google anzeigen (z. B. Abbruch)
  const params = new URLSearchParams(location.search + location.hash.replace(/^#/, '&'));
  const authError = params.get('error_description');
  if (authError) {
    set({ error: `Anmeldung fehlgeschlagen: ${authError.replace(/\+/g, ' ')}` });
    history.replaceState(null, '', location.pathname);
  }

  db.auth.onAuthStateChange((event, session) => {
    const user = toUser(session);
    const before = useSync.getState().user;
    set({ user, authReady: true });
    if (user && user.id !== before?.id) {
      setRemoteAttachmentFetcher(id => downloadAttachment(db, user.id, id));
      subscribe(user.id);
      requestSync(0);
    }
    if (!user && before) {
      setRemoteAttachmentFetcher(null);
      void channel?.unsubscribe();
      channel = null;
    }
    // Code aus der Adresszeile entfernen, sobald die Anmeldung durch ist
    if (event === 'SIGNED_IN' && location.search.includes('code=')) history.replaceState(null, '', location.pathname);
  });

  void isGoogleEnabled().then(googleEnabled => set({ googleEnabled }));

  window.addEventListener('online', () => requestSync(0));
  window.addEventListener('offline', () => set({ status: 'offline' }));
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && requestSync(0));
  interval = setInterval(() => document.visibilityState === 'visible' && requestSync(0), 60_000);
}

function subscribe(userId: string) {
  void channel?.unsubscribe();
  const db = supabase();
  channel = db.channel(`nz-${userId}`);
  for (const table of ['nz_notes', 'nz_notebooks', 'nz_tags', 'nz_attachments']) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` }, () => requestSync(800));
  }
  channel.subscribe();
}

/** Synchronisierung anstoßen (gebündelt). */
export function requestSync(delay = 2000) {
  if (!useSync.getState().user) return;
  clearTimeout(debounce);
  debounce = setTimeout(() => void syncNow(), delay);
}

export async function syncNow(): Promise<void> {
  const user = useSync.getState().user;
  if (!user || !host) return;
  if (running) {
    again = true;
    return running;
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    set({ status: 'offline' });
    return;
  }
  set({ status: 'syncing', error: null });
  running = (async () => {
    try {
      do {
        again = false;
        const res = await syncOnce(supabase(), user.id, host!, progress => set({ progress }));
        if (res.pulled) onRemoteApplied?.(res.pulled);
      } while (again);
      set({ status: 'idle', lastSyncAt: Date.now(), progress: null });
    } catch (e) {
      console.error(e);
      const offline = typeof navigator !== 'undefined' && !navigator.onLine;
      set({ status: offline ? 'offline' : 'error', progress: null, error: offline ? null : describe(e) });
    } finally {
      running = null;
    }
  })();
  return running;
}

function describe(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  if (/JWT|token|auth/i.test(msg)) return 'Die Anmeldung ist abgelaufen. Bitte melde dich erneut an.';
  if (/quota|exceeded|too large|payload/i.test(msg)) return 'Der Cloud-Speicher ist voll oder eine Datei ist zu groß.';
  if (/fetch|network/i.test(msg)) return 'Keine Verbindung zum Server.';
  return `Synchronisierung fehlgeschlagen: ${msg}`;
}

export async function signInWithGoogle() {
  const { googleEnabled } = useSync.getState();
  if (googleEnabled === false) {
    set({ error: 'Die Anmeldung mit Google ist im Supabase-Projekt noch nicht eingeschaltet (siehe Anleitung in der README).' });
    return;
  }
  const { error } = await supabase().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${location.origin}${location.pathname}`, queryParams: { prompt: 'select_account' } },
  });
  if (error) set({ error: `Anmeldung fehlgeschlagen: ${error.message}` });
}

export async function signOut() {
  clearTimeout(debounce);
  await running;
  await supabase().auth.signOut();
  set({ user: null, status: 'idle', lastSyncAt: null, error: null });
}

export function stopSync() {
  clearInterval(interval);
}
