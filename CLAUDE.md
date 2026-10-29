# Projekt-Hinweise für Claude

Alles auf Deutsch schreiben: sichtbare Texte, Code-Kommentare, Commit-Nachrichten. Vor jedem Commit `npm run check` ausführen.

## iPhone-/Home-Bildschirm-Icons

Icons für den iOS-Home-Bildschirm immer so einbauen (bewährt in Chatlupe und CoroaPDF):

- Das Icon als **180 × 180 PNG** erzeugen: quadratisch, volle Fläche, keine Transparenz, keine eigenen abgerundeten Ecken (iOS rundet selbst ab).
- Das PNG **als Base64-Data-URI direkt in `index.html` einbetten**, nicht als separate Datei verlinken. Sonst zeigt iOS oft nur einen Buchstaben-Platzhalter:
  ```html
  <link rel="apple-touch-icon" href="data:image/png;base64,…" sizes="180x180" type="image/png">
  ```
  In diesem Next.js-Projekt gibt es kein `index.html`: Die Data-URI steht in `src/app/touch-icon.ts` und wird in `src/app/layout.tsx` eingebunden.
- Zusätzlich im `<head>`:
  ```html
  <link rel="manifest" href="/manifest.webmanifest">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="App-Name">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="theme-color" content="#…">
  <link rel="icon" href="/icon-32.png" sizes="32x32" type="image/png">
  ```
- `public/manifest.webmanifest` mit Icons in 192 und 512 px (für Android) anlegen, PNGs in `public/`.
- Die Quelle des Icons liegt als SVG vor; die PNGs werden daraus gerendert (z. B. mit Playwright/Chromium-Screenshot in 32, 180, 192, 512 px).
- Nach dem Deploy prüfen, dass `data:image/png;base64` im ausgelieferten `index.html` steht.
- Nutzern sagen: altes Icon vom Home-Bildschirm löschen, Safari-Website-Daten der Seite löschen, Seite in Safari neu öffnen und „Zum Home-Bildschirm“ wählen.
