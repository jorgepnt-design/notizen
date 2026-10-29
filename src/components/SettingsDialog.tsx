'use client';

import { useEffect, useState } from 'react';
import { FileUp, HardDrive, Monitor, Moon, Sun } from 'lucide-react';
import { deleteAllData, notify, setTheme, useNotes } from '@/store/notes';
import { fileSize } from '@/lib/format';
import type { Theme } from '@/lib/types';
import { Modal } from './ui/Modal';
import { confirmDialog } from './ui/dialogs';

const THEMES: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: 'light', label: 'Hell', icon: <Sun size={16} /> },
  { value: 'dark', label: 'Dunkel', icon: <Moon size={16} /> },
  { value: 'system', label: 'System', icon: <Monitor size={16} /> },
];

export function SettingsDialog({ onClose, onImport }: { onClose: () => void; onImport: () => void }) {
  const theme = useNotes(s => s.settings.theme);
  const noteCount = useNotes(s => Object.keys(s.notes).length);
  const attachmentCount = useNotes(s => Object.keys(s.attachments).length);
  const counts = { notes: noteCount, attachments: attachmentCount };
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    navigator.storage?.estimate?.().then(e => setUsage({ used: e.usage ?? 0, quota: e.quota ?? 0 })).catch(() => undefined);
    navigator.storage?.persisted?.().then(setPersisted).catch(() => undefined);
  }, []);

  const wipe = async () => {
    const ok = await confirmDialog({
      title: 'Alle Daten löschen?',
      message: `Alle ${counts.notes} Notizen, Notizbücher, Schlagwörter und Anhänge werden von diesem Gerät entfernt. Das lässt sich nicht rückgängig machen.`,
      confirmLabel: 'Alles endgültig löschen',
      danger: true,
    });
    if (!ok) return;
    await deleteAllData();
    notify('Alle Daten wurden gelöscht.');
    onClose();
  };

  return (
    <Modal title="Einstellungen" onClose={onClose} size="lg" footer={<button className="btn-primary" onClick={onClose}>Fertig</button>}>
      <div className="space-y-7">
        <section aria-labelledby="set-theme">
          <h3 id="set-theme" className="mb-2 font-semibold">
            Darstellung
          </h3>
          <div role="radiogroup" aria-label="Farbschema" className="grid grid-cols-3 gap-2">
            {THEMES.map(t => (
              <button
                key={t.value}
                role="radio"
                aria-checked={theme === t.value}
                onClick={() => setTheme(t.value)}
                className={`btn border py-2.5 ${theme === t.value ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line text-ink hover:bg-sunken'}`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="set-storage">
          <h3 id="set-storage" className="mb-2 font-semibold">
            Datenspeicherung
          </h3>
          <div className="flex gap-3 rounded-xl border border-accent/30 bg-accent-soft/60 p-4 leading-relaxed">
            <HardDrive size={20} className="mt-0.5 shrink-0 text-accent" />
            <div className="space-y-1.5">
              <p className="font-medium">Deine Notizen werden zurzeit nur auf diesem Gerät gespeichert.</p>
              <p className="text-muted">
                Alles liegt im lokalen Speicher dieses Browsers (IndexedDB). Es wird nichts hochgeladen, und es gibt noch keine Synchronisierung
                zwischen Geräten oder Browsern. Wenn du die Website-Daten dieser Seite im Browser löschst, sind auch die Notizen weg.
              </p>
              <p className="text-muted">
                {counts.notes} Notizen · {counts.attachments} Anhänge
                {usage && usage.quota > 0 && ` · ${fileSize(usage.used)} von ca. ${fileSize(usage.quota)} belegt`}
                {persisted === true && ' · dauerhafter Speicher aktiv'}
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="set-import">
          <h3 id="set-import" className="mb-1 font-semibold">
            Joplin-Import
          </h3>
          <p className="mb-3 leading-relaxed text-muted">
            Exportiere in Joplin über <b className="text-ink">Datei → Exportieren → JEX – Joplin Export File</b> und wähle die .jex-Datei hier aus.
            Notizbücher, Schlagwörter, Bilder und Anhänge werden übernommen. Ein erneuter Import aktualisiert bereits importierte Notizen, statt sie zu
            verdoppeln.
          </p>
          <button
            className="btn-secondary"
            onClick={() => {
              onClose();
              onImport();
            }}
          >
            <FileUp size={16} /> .jex-Datei importieren
          </button>
        </section>

        <section aria-labelledby="set-keys">
          <h3 id="set-keys" className="mb-2 font-semibold">
            Tastenkürzel
          </h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-muted">
            {[
              ['Alt + N', 'Neue Notiz'],
              ['Strg/⌘ + K oder /', 'Suche'],
              ['↑ / ↓ in der Liste', 'Vorherige / nächste Notiz'],
              ['Strg/⌘ + B, I', 'Fett, kursiv'],
              ['Strg/⌘ + Alt + 1–3', 'Überschriften'],
              ['Strg/⌘ + Klick', 'Link öffnen'],
              ['Esc', 'Dialog schließen'],
            ].map(([k, v]) => (
              <div key={k} className="contents">
                <dt>
                  <kbd className="rounded border border-line bg-canvas px-1.5 py-0.5 font-sans text-xs text-ink">{k}</kbd>
                </dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="set-danger" className="rounded-xl border border-danger/30 p-4">
          <h3 id="set-danger" className="mb-1 font-semibold text-danger">
            Alle Daten löschen
          </h3>
          <p className="mb-3 text-muted">Entfernt alle Notizen, Notizbücher, Schlagwörter und Anhänge von diesem Gerät.</p>
          <button className="btn-danger" onClick={wipe}>
            Alle Daten löschen …
          </button>
        </section>
      </div>
    </Modal>
  );
}
