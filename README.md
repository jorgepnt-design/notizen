# Notizen

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
npm test             # Unit-Tests (Vitest): Joplin-Import, Suche, Sortierung
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

## Datenspeicherung

**Alle Daten bleiben auf dem Gerät.** Notizen, Notizbücher, Schlagwörter, Anhänge und Einstellungen liegen in der IndexedDB des Browsers (Datenbank `notizen`). Es gibt kein Benutzerkonto, nichts wird hochgeladen, und es gibt (noch) keine Synchronisierung zwischen Geräten oder Browsern.

- Die Daten bleiben nach Neuladen und Neustart erhalten. Die App bittet den Browser um dauerhaften Speicher (`navigator.storage.persist()`).
- Wer die Website-Daten der Seite löscht oder im privaten Modus arbeitet, verliert die Notizen.
- Anhänge werden getrennt von den Notizen als Blobs gespeichert und erst beim Anzeigen geladen.
- Änderungen werden gebündelt nach 0,5 Sekunden gespeichert, beim Wechsel der Notiz, beim Verlassen der Seite und beim Wechsel in den Hintergrund sofort.

### Vorbereitet für Konten und Synchronisierung

Oberfläche und Datenzugriff sind getrennt:

```
src/lib/storage/repository.ts   Schnittstelle NotesRepository
src/lib/storage/indexeddb.ts    heutige Umsetzung mit IndexedDB
src/lib/storage/index.ts        getRepository() / setRepository()
src/store/notes.ts              Zustand und Aktionen der Oberfläche (Zustand)
```

Der Store greift ausschließlich über `NotesRepository` auf Daten zu. Für eine Synchronisierung wird eine weitere Umsetzung dieser Schnittstelle geschrieben (z. B. IndexedDB als Offline-Puffer plus Server-API) und per `setRepository()` eingesetzt. Alle Datensätze tragen eine eindeutige ID sowie `createdAt`/`updatedAt`, gelöschte Notizen ein `deletedAt` – die Grundlage für einen späteren Abgleich.

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

- Keine Synchronisierung und kein Benutzerkonto: Die Daten liegen nur in diesem Browser auf diesem Gerät.
- Es gibt noch keine Sicherung aller Daten in eine Datei; exportieren lässt sich nur jede Notiz einzeln als Markdown.
- Verschlüsselte Joplin-Exporte werden übersprungen (vor dem Export in Joplin die Verschlüsselung deaktivieren).
- Joplin-Besonderheiten wie Mathe-Formeln (KaTeX), Mermaid-Diagramme oder `==Markierungen==` werden als normaler Text übernommen; Erinnerungs- und Fälligkeitsdaten von Aufgaben nicht.
- Anhänge, die kein Bild sind (z. B. PDFs), erscheinen als Link und öffnen sich in einem neuen Tab.
- Sehr große Exporte (mehrere hundert MB) werden vollständig in den Arbeitsspeicher gelesen; auf älteren Smartphones kann das knapp werden.
