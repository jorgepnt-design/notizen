'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CloudOff, HardDrive, Loader2, LogOut, RefreshCw } from 'lucide-react';
import { signInWithGoogle, signOut, syncNow, useSync } from '@/lib/sync';

function GoogleLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function GoogleButton({ className = '' }: { className?: string }) {
  return (
    <button className={`btn-secondary ${className}`} onClick={() => void signInWithGoogle()}>
      <GoogleLogo /> Mit Google anmelden
    </button>
  );
}

/** „vor 2 Min.“ – aktualisiert sich selbst */
function useAgo(ts: number | null) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick(x => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!ts) return '';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 45) return 'gerade eben';
  const m = Math.round(s / 60);
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.round(m / 60);
  return h < 24 ? `vor ${h} Std.` : new Date(ts).toLocaleDateString('de-DE');
}

export function SyncStatus() {
  const { status, lastSyncAt, progress } = useSync();
  const ago = useAgo(lastSyncAt);
  if (status === 'syncing')
    return (
      <span className="inline-flex items-center gap-1.5">
        <Loader2 size={12} className="animate-spin text-accent" /> {progress ?? 'Synchronisiert …'}
      </span>
    );
  if (status === 'offline')
    return (
      <span className="inline-flex items-center gap-1.5">
        <CloudOff size={12} /> Offline – wird später abgeglichen
      </span>
    );
  if (status === 'error')
    return (
      <span className="inline-flex items-center gap-1.5 text-danger">
        <AlertCircle size={12} /> Sync-Fehler
      </span>
    );
  return <span>{lastSyncAt ? `Synchronisiert ${ago}` : 'Wird verbunden …'}</span>;
}

function Avatar({ url, name, size = 28 }: { url: string | null; name: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (url && !broken)
    // eslint-disable-next-line @next/next/no-img-element -- externes Profilbild von Google
    return <img src={url} alt="" width={size} height={size} referrerPolicy="no-referrer" className="shrink-0 rounded-full" onError={() => setBroken(true)} />;
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-on-accent" style={{ width: size, height: size }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Fußzeile der Seitenleiste: Konto oder Anmelde-Knopf */
export function AccountFooter({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { user, authReady } = useSync();
  if (!authReady) return null;
  if (!user)
    return (
      <div className="space-y-1.5 px-1 pt-1">
        <GoogleButton className="w-full" />
        <p className="flex items-center gap-1.5 px-2 text-[11px] text-muted">
          <HardDrive size={12} /> Ohne Anmeldung nur auf diesem Gerät
        </p>
      </div>
    );
  return (
    <button className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-sunken" onClick={onOpenSettings} title="Konto & Synchronisierung">
      <Avatar url={user.avatarUrl} name={user.name} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{user.name}</span>
        <span className="block truncate text-[11px] text-muted">
          <SyncStatus />
        </span>
      </span>
    </button>
  );
}

/** Abschnitt in den Einstellungen */
export function AccountSection() {
  const { user, status, error, googleEnabled } = useSync();
  return (
    <section aria-labelledby="set-account">
      <h3 id="set-account" className="mb-2 font-semibold">
        Konto &amp; Synchronisierung
      </h3>
      {user ? (
        <div className="space-y-3 rounded-xl border border-line p-4">
          <div className="flex items-center gap-3">
            <Avatar url={user.avatarUrl} name={user.name} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
            </div>
          </div>
          <p className="text-xs text-muted">
            <SyncStatus />
          </p>
          {error && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-danger" role="alert">
              {error}
            </p>
          )}
          <p className="leading-relaxed text-muted">
            Deine Notizen, Notizbücher, Schlagwörter und Anhänge werden automatisch mit deinem Konto abgeglichen. Melde dich auf jedem Gerät mit
            demselben Google-Konto an, um überall denselben Stand zu sehen. Offline geschriebene Notizen werden nachgeholt, sobald wieder eine
            Verbindung besteht.
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => void syncNow()} disabled={status === 'syncing'}>
              <RefreshCw size={15} className={status === 'syncing' ? 'animate-spin' : ''} /> Jetzt synchronisieren
            </button>
            <button className="btn-ghost" onClick={() => void signOut()}>
              <LogOut size={15} /> Abmelden
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-line p-4">
          <p className="leading-relaxed text-muted">
            Melde dich mit deinem Google-Konto an, um deine Notizen auf allen Geräten zu haben. Sie werden dann verschlüsselt übertragen und in
            deinem Konto gespeichert; nur du hast Zugriff darauf. Notizen, die schon auf diesem Gerät sind, werden dabei übernommen.
          </p>
          {googleEnabled === false && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-danger" role="alert">
              Die Google-Anmeldung ist auf dem Server noch nicht eingeschaltet. Sobald sie eingerichtet ist, funktioniert dieser Knopf.
            </p>
          )}
          {error && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-danger" role="alert">
              {error}
            </p>
          )}
          <GoogleButton />
        </div>
      )}
    </section>
  );
}
