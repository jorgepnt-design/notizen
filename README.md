# Notizen by Jorge

Eine deutschsprachige Notizen-App für den Browser, angelehnt an die übersichtliche Arbeitsweise von Evernote: links die Navigation, in der Mitte die Notizenliste, rechts ein großer Editor. Notizen aus **Joplin** lassen sich per `.jex`-Export übernehmen.

Gebaut mit Next.js (statischer Export), TypeScript, Tailwind CSS, Tiptap als Rich-Text-Editor und IndexedDB als lokalem Speicher.

## Starten

Voraussetzung: Node.js 18.18 oder neuer.

```bash
npm install
npm run dev          # Entwicklungsserver auf http://localhost:3000
```

Produktionsversion:

```bash
npm run build        # erzeugt die statische App im Ordner out/
npm start            # liefert out/ lokal aus (über „npx serve“)
```

Der Ordner `out/` kann auf jedem statischen Hosting liegen (z. B. Vercel, Netlify, GitHub Pages). Einen Server braucht die App nicht.

## Prüfungen

```bash
npm run typecheck    # TypeScript
npm run lint         # ESLint
npm test             # Unit-Tests (Vitest): Joplin-Import, Export, Suche, Sortierung, Synchronisierung
npm run check        # alles oben plus Produktions-Build
```

Browser-Durchlauf der Hauptabläufe (benötigt Playwright mit Chromium):

```bash
npm run build && npx serve out -l 4173 &
python3 scripts/make-test-jex.py /tmp/test.jex public/icon-192.png
node scripts/e2e.cjs /tmp/test.jex /tmp
```

Geprüft werden unter anderem: Beispielnotizen beim ersten Start, Notiz anlegen per Tastenkürzel, Formatierung, Schlagwörter, Speichern über Neuladen hinweg, kein Verlust beim schnellen Notizwechsel, Suche, Notizbuch-Zuordnung, Favoriten, Duplizieren, Markdown-Export, Papierkorb samt Wiederherstellen und endgültigem Löschen, Notizbuch löschen, Joplin-Import (mit Bild, Tabelle, Checkliste, Schlagwort, Notizlink, gelöschter Notiz), erneuter Import ohne Duplikate, Dark Mode sowie Smartphone- und Tablet-Ansicht.

## Funktionen

**Aufbau**
- Seitenleiste mit Suche, „Neue Notiz“, Alle Notizen, Favoriten, Notizbüchern (auch verschachtelt), Schlagwörtern und Papierkorb
- Notizenliste mit Vorschautext, Änderungsdatum, Notizbuch und Schlagwörtern, Sortierung (zuletzt geändert, erstellt, Titel) sowie Filtern nach Notizbuch und Schlagwort
- Großer Editor für die ausgewählte Notiz
- Helles und dunkles Farbschema (oder automatisch nach System)
- Tablet: Navigation als ausklappbare Leiste, Liste und Editor nebeneinander. Smartphone: Liste und Editor im Wechsel mit Zurück-Schaltfläche

**Notizen**
- Erstellen, bearbeiten, duplizieren, in den Papierkorb verschieben
- Aus dem Papierkorb wiederherstellen oder nach Rückfrage endgültig löschen; „Papierkorb leeren“
- Als Favorit markieren und oben anheften
- Einem Notizbuch zuordnen, beliebig viele Schlagwörter vergeben (mit Vorschlägen)
- Einzelne Notiz als Markdown-Datei exportieren (Bilder als Data-URI eingebettet)
- Alle Notizen exportieren (Einstellungen): als **.jex** – Sicherung, die sich hier und in Joplin wieder importieren lässt – oder als **Markdown-ZIP** mit einem Ordner je Notizbuch, Anhängen in `_Anhänge/` und Titel, Notizbuch, Schlagwörtern und Datum im YAML-Kopf jeder Datei
- Notizen per Drag & Drop auf ein Notizbuch ziehen

**Editor (Tiptap)**
- Überschriften, fett, kursiv, durchgestrichen, Code, Aufzählungen, nummerierte Listen, Checklisten, Links, Zitate, Codeblöcke, Tabellen (aus Importen)
- Markdown-Kürzel beim Tippen (`## `, `- `, `[ ] `, `> `, ` ``` `)
- Bilder und Dateien per Büroklammer, Einfügen oder Hineinziehen anhängen
- Automatisches Speichern mit sichtbarem Status („Speichert …“, „Gespeichert“, „Nicht gespeichert – Erneut versuchen“)

**Notizbücher und Schlagwörter**
- Notizbücher anlegen (auch als Unter-Notizbuch), umbenennen, verschieben und löschen. Beim Löschen bleiben die Notizen erhalten und landen in „Unsortiert“; Unter-Notizbücher rücken eine Ebene nach oben.
- Schlagwörter umbenennen und löschen (die Notizen bleiben erhalten)

**Joplin-Import**
- In Joplin: *Datei → Exportieren → JEX – Joplin Export File*, dann hier *Einstellungen → .jex-Datei importieren* (oder die Datei ins Fenster ziehen)
- Übernimmt Notizbücher samt Verschachtelung, Notizen (Markdown und HTML), Schlagwörter, Bilder und Anhänge, Checklisten, Tabellen, Links zwischen Notizen sowie Erstell- und Änderungsdaten
- Joplin-Aufgaben erhalten das Schlagwort „Aufgabe“ bzw. „Erledigt“; in Joplin gelöschte Notizen landen im Papierkorb
- Erneuter Import derselben Datei aktualisiert die Notizen, statt sie zu verdoppeln; Favoriten und Anheften bleiben erhalten

**Tastenkürzel**

| Kürzel | Wirkung |
|---|---|
| `Alt` + `N` | Neue Notiz |
| `Strg`/`⌘` + `K` oder `/` | Suche |
| `↑` / `↓` in der Liste | Vorherige / nächste Notiz |
| `Strg`/`⌘` + `B`, `I` | Fett, kursiv |
| `Strg`/`⌘` + `Alt` + `1`–`3` | Überschriften |
| `Strg`/`⌘` + Klick | Link im Editor öffnen |
| `Esc` | Dialog oder Menü schließen |

## Datenspeicherung und Synchronisierung

**Ohne Anmeldung** bleiben alle Daten auf dem Gerät: Notizen, Notizbücher, Schlagwörter, Anhänge und Einstellungen liegen in der IndexedDB des Browsers (Datenbank `notizen`). Wer die Website-Daten der Seite löscht oder im privaten Modus arbeitet, verliert sie. Deshalb regelmäßig über *Einstellungen → Notizen exportieren* eine .jex-Sicherung anlegen.

**Mit Google-Anmeldung** werden die Daten zusätzlich mit dem eigenen Konto abgeglichen, sodass auf allen Geräten derselbe Stand zu sehen ist:

- Jedes Gerät behält eine vollständige Kopie in IndexedDB – die App funktioniert auch offline; Änderungen werden nachgeholt.
- Abgeglichen wird nach jeder Änderung (gebündelt nach etwa 2 Sekunden), beim Start, wenn die Seite wieder sichtbar oder online wird, jede Minute und sofort, wenn ein anderes Gerät etwas ändert (Supabase Realtime).
- Konflikte: Pro Notiz, Notizbuch, Schlagwort und Anhang gewinnt der zuletzt geänderte Stand. Der Server lässt einen älteren Stand nie einen neueren überschreiben.
- Löschungen werden als Löschmarken übertragen und kommen so auf allen Geräten an.
- Anhänge liegen im Supabase-Storage (Bucket `nz-attachments`, Pfad `<benutzer>/<anhang>`) und werden auf anderen Geräten erst beim Anzeigen geladen.
- Bei der ersten Anmeldung werden Notizen, die schon auf dem Gerät sind, ins Konto übernommen. Unveränderte Beispielnotizen werden dabei weggelassen, wenn das Konto schon Notizen hat.
- „Alle Daten löschen“ entfernt bei angemeldeten Nutzern nur die Kopie auf dem Gerät und meldet ab; das Konto bleibt unverändert.

### Server (Supabase)

Die Daten liegen in einem Supabase-Projekt (über die Vercel-Integration), das auch von anderen Apps genutzt wird. Deshalb tragen alle Tabellen das Präfix `nz_`:

| Tabelle | Inhalt |
|---|---|
| `nz_notes` | Notizen (HTML-Inhalt, Notizbuch, Schlagwörter, Favorit, angeheftet, Papierkorb) |
| `nz_notebooks` | Notizbücher (mit Eltern-Notizbuch) |
| `nz_tags` | Schlagwörter |
| `nz_attachments` | Metadaten der Anhänge |

Jede Zeile gehört über `user_id` genau einem Benutzer; Row Level Security erlaubt nur Zugriff auf eigene Zeilen, ebenso im Storage. `changed_at` (Zeitstempel des Geräts) entscheidet Konflikte, `server_updated_at` (vom Server gesetzt) dient als Abruf-Marke, `deleted` ist die Löschmarke. Die Migration liegt in `supabase/migrations/`.

URL und öffentlicher Schlüssel stehen in `src/lib/sync/client.ts` und lassen sich über `NEXT_PUBLIC_SUPABASE_URL` und `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` überschreiben.

### Google-Anmeldung einrichten (einmalig)

1. **Google Cloud Console** → [APIs & Dienste → Anmeldedaten](https://console.cloud.google.com/apis/credentials): ggf. den OAuth-Zustimmungsbildschirm anlegen, dann *Anmeldedaten erstellen → OAuth-Client-ID → Webanwendung*.
   - Autorisierte Weiterleitungs-URI: `https://ylbfimgvfnhlwtjxwvov.supabase.co/auth/v1/callback`
2. **Supabase** → [Authentication → Sign In / Providers → Google](https://supabase.com/dashboard/project/ylbfimgvfnhlwtjxwvov/auth/providers): einschalten, Client-ID und Client-Secret aus Schritt 1 eintragen, speichern.
3. **Supabase** → [Authentication → URL Configuration](https://supabase.com/dashboard/project/ylbfimgvfnhlwtjxwvov/auth/url-configuration): unter *Redirect URLs* `https://notizen-kappa.vercel.app/**` hinzufügen (für lokale Entwicklung zusätzlich `http://localhost:3000/**`). Die *Site URL* der anderen Apps bleibt unverändert.

Solange Schritt 2 fehlt, zeigt die App beim Anmelden einen Hinweis statt einer Fehlerseite.

### Aufbau im Code

```
src/lib/storage/repository.ts   Schnittstelle NotesRepository (lokaler Speicher)
src/lib/storage/indexeddb.ts    Umsetzung mit IndexedDB, inkl. Löschmarken und Sync-Stand
src/lib/sync/client.ts          Supabase-Client und Zugangsdaten
src/lib/sync/engine.ts          Abgleich (abrufen, Konflikte lösen, senden)
src/lib/sync/index.ts           Anmeldung, Auslöser, Realtime, Status
src/store/notes.ts              Zustand der Oberfläche; stellt dem Abgleich `syncHost` bereit
```

## Projektstruktur

```
src/app/                 Next.js-Einstieg, Layout, globale Styles
src/components/          Oberfläche (Seitenleiste, Liste, Editor, Dialoge)
src/lib/                 Logik ohne Oberfläche: Typen, Speicher, Suche, Import, Export
src/store/notes.ts       Anwendungszustand und automatisches Speichern
tests/                   Unit-Tests
scripts/                 Browser-Durchlauf und Testdaten
```

## Bekannte Einschränkungen

- Synchronisierung nur mit Google-Konto; die Google-Anmeldung muss einmalig eingerichtet werden (siehe oben).
- Bei gleichzeitiger Bearbeitung derselben Notiz auf zwei Geräten gewinnt der zuletzt gespeicherte Stand – Änderungen werden nicht zusammengeführt.
- Kostenloser Supabase-Plan: 500 MB Datenbank und 1 GB Dateispeicher für alle Apps des Projekts zusammen; einzelne Anhänge höchstens 50 MB.
- Beim Export als .jex gehen Favoriten und Anheften verloren (Joplin kennt beides nicht); im Markdown-ZIP stehen sie im Kopfbereich jeder Datei.
- Verschlüsselte Joplin-Exporte werden übersprungen (vor dem Export in Joplin die Verschlüsselung deaktivieren).
- Joplin-Besonderheiten wie Mathe-Formeln (KaTeX), Mermaid-Diagramme oder `==Markierungen==` werden als normaler Text übernommen; Erinnerungs- und Fälligkeitsdaten von Aufgaben nicht.
- Anhänge, die kein Bild sind (z. B. PDFs), erscheinen als Link und öffnen sich in einem neuen Tab.
- Sehr große Exporte (mehrere hundert MB) werden vollständig in den Arbeitsspeicher gelesen; auf älteren Smartphones kann das knapp werden.
