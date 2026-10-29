import { htmlToText } from './html';
import { newId, type Note, type Notebook, type Tag } from './types';

/** Beispielinhalte für den allerersten Start. */
export function createSeed(now = Date.now()) {
  const nb = (name: string): Notebook => ({ id: newId(), name, parentId: null, createdAt: now, updatedAt: now });
  const tag = (name: string): Tag => ({ id: newId(), name, createdAt: now });
  const personal = nb('Persönlich');
  const work = nb('Arbeit');
  const tips = tag('Tipps');
  const ideas = tag('Ideen');

  let t = now;
  const note = (title: string, content: string, notebookId: string | null, tagIds: string[], extra: Partial<Note> = {}): Note => {
    t -= 60_000;
    return { id: newId(), title, content, text: htmlToText(content), notebookId, tagIds, favorite: false, pinned: false, createdAt: t, updatedAt: t, deletedAt: null, ...extra };
  };

  const notes: Note[] = [
    note(
      'Willkommen bei Notizen 👋',
      `<p>Schön, dass du da bist! Diese Beispielnotizen zeigen dir, wie die App funktioniert. Du kannst sie bearbeiten oder löschen.</p>
<h2>So ist die App aufgebaut</h2>
<ul><li><p><strong>Links</strong> findest du Suche, Notizbücher, Schlagwörter, Favoriten und den Papierkorb.</p></li>
<li><p><strong>In der Mitte</strong> stehen die Notizen der gewählten Ansicht, mit Sortierung und Filtern.</p></li>
<li><p><strong>Rechts</strong> schreibst du. Alles wird automatisch gespeichert.</p></li></ul>
<blockquote><p>Deine Notizen bleiben auf diesem Gerät, im Speicher dieses Browsers.</p></blockquote>`,
      null,
      [tips.id],
      { pinned: true, favorite: true },
    ),
    note(
      'Tastenkürzel & Tipps',
      `<h2>Tastenkürzel</h2>
<ul><li><p><code>Alt</code> + <code>N</code>: neue Notiz</p></li>
<li><p><code>Strg</code>/<code>⌘</code> + <code>K</code> oder <code>/</code>: Suche</p></li>
<li><p><code>Strg</code>/<code>⌘</code> + <code>B</code> / <code>I</code>: fett / kursiv</p></li>
<li><p><code>Strg</code>/<code>⌘</code> + <code>Alt</code> + <code>1–3</code>: Überschriften</p></li></ul>
<h2>Markdown-Kürzel beim Tippen</h2>
<p>Tippe <code>## </code> für eine Überschrift, <code>- </code> für eine Liste, <code>[ ] </code> für eine Checkliste, <code>&gt; </code> für ein Zitat oder <code>\`\`\`</code> für einen Codeblock.</p>
<pre><code>Codeblöcke eignen sich für Befehle,
Konfigurationen oder Textbausteine.</code></pre>`,
      null,
      [tips.id],
    ),
    note(
      'Wochenplan',
      `<p>Was diese Woche ansteht:</p>
<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Angebot an Kundin schicken</p></li>
<li data-type="taskItem" data-checked="false"><p>Präsentation für Freitag vorbereiten</p></li>
<li data-type="taskItem" data-checked="false"><p>Teamtermin für Q4-Planung finden</p></li></ul>
<p>Mehr dazu im <a href="https://de.wikipedia.org/wiki/Zeitmanagement" target="_blank" rel="noopener noreferrer">Artikel über Zeitmanagement</a>.</p>`,
      work.id,
      [],
    ),
    note(
      'Ideen für den Urlaub',
      `<h2>Mögliche Ziele</h2>
<ol><li><p>Lissabon – Altstadt, Fado, Pastéis de Nata</p></li><li><p>Dolomiten – Wandern im September</p></li><li><p>Kopenhagen mit dem Rad</p></li></ol>
<p><em>Budget und Termine noch abstimmen.</em></p>`,
      personal.id,
      [ideas.id],
      { favorite: true },
    ),
    note(
      'Notizen aus Joplin übernehmen',
      `<p>Du kannst deine Notizen aus <strong>Joplin</strong> importieren, mit Notizbüchern, Schlagwörtern, Bildern und Anhängen.</p>
<ol><li><p>In Joplin: <strong>Datei → Exportieren → JEX – Joplin Export File</strong></p></li>
<li><p>Hier: <strong>Einstellungen → Joplin-Import</strong> und die <code>.jex</code>-Datei wählen</p></li></ol>
<p>Ein erneuter Import derselben Datei legt keine doppelten Notizen an, er aktualisiert die vorhandenen.</p>`,
      null,
      [tips.id],
    ),
  ];

  return { notes, notebooks: [personal, work], tags: [tips, ideas] };
}
