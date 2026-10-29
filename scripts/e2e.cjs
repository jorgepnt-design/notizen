// Browser-Durchlauf der wichtigsten Abläufe.
// Aufruf: node scripts/e2e.cjs <test.jex> <ordner-fuer-screenshots>
// Voraussetzung: gebaute App läuft unter APP_URL (Standard http://localhost:4173/) und Playwright ist installiert.
const { chromium } = require('playwright');
const [, , jex, shots] = process.argv;
const URL = process.env.APP_URL || 'http://localhost:4173/';
const log = (...a) => console.log('✔', ...a);
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'de-DE' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => m.type() === 'error' && errors.push('console: ' + m.text()));
  const expect = async (cond, msg) => { if (!(await cond)) throw new Error('FEHLGESCHLAGEN: ' + msg); log(msg); };
  const list = page.locator('#main-list');
  process.on('unhandledRejection', ()=>{});
  global.__page = page;

  await page.goto(URL);
  await page.getByText('Willkommen bei Notizen 👋').first().waitFor();
  await expect(list.locator('[data-note]').count().then(n => n === 5), 'Beispielnotizen beim ersten Start (5)');
  await page.screenshot({ path: shots + '/1-desktop.png' });

  // Neue Notiz per Tastenkürzel
  await page.keyboard.press('Alt+KeyN');
  await page.locator('#note-title').waitFor();
  await expect(page.evaluate(() => document.activeElement?.id === 'note-title'), 'Alt+N legt Notiz an und fokussiert den Titel');
  await page.keyboard.type('Testnotiz Zitronenkuchen');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Zutaten: Mehl, Zucker, Zitronen');
  await page.keyboard.press('Enter');
  await page.keyboard.type('[ ] Backofen vorheizen');
  await page.getByText('Gespeichert').first().waitFor();
  await expect(page.locator('.note-content ul[data-type=taskList]').count().then(n => n === 1), 'Markdown-Kürzel erzeugt Checkliste');

  // Fett über Toolbar
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Fett (Strg+B)' }).click();
  await page.keyboard.type('fetter Text');
  await expect(page.locator('.note-content strong', { hasText: 'fetter Text' }).count().then(n => n === 1), 'Toolbar: Fettdruck');

  // Schlagwort
  await page.getByLabel('Schlagwort hinzufügen').fill('Backen');
  await page.getByLabel('Schlagwort hinzufügen').press('Enter');
  await page.locator('nav').getByRole('button', { name: 'Backen', exact: true }).waitFor();
  log('Schlagwort vergeben, erscheint in der Seitenleiste');

  // Schneller Wechsel direkt nach dem Tippen (Datenverlust-Test)
  await page.locator('.note-content').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' SCHNELL');
  await list.locator('[data-note]').nth(1).click();
  await page.waitForTimeout(800);

  // Neu laden → dauerhaft gespeichert?
  await page.reload();
  await page.getByText('Willkommen bei Notizen 👋').first().waitFor();
  await list.getByText('Testnotiz Zitronenkuchen').click();
  await expect(page.locator('.note-content').innerText().then(t => t.includes('Mehl') && t.includes('SCHNELL')), 'Inhalt nach Neuladen vorhanden (auch Änderung direkt vor Wechsel)');

  // Suche (Strg+K)
  await page.keyboard.press('Control+KeyK');
  await page.keyboard.type('zitronen');
  await expect(list.locator('[data-note]').count().then(n => n === 1), 'Volltextsuche findet Notiz über Inhalt');
  await expect(list.locator('mark').count().then(n => n > 0), 'Treffer werden markiert');
  await page.locator('nav [data-search]').fill('');

  // Notizbuch anlegen und zuordnen
  await page.getByRole('button', { name: 'Neues Notizbuch' }).click();
  await page.locator('#prompt-input').fill('Rezepte');
  await page.getByRole('button', { name: 'Anlegen' }).click();
  await page.getByRole('heading', { name: 'Rezepte' }).waitFor();
  await page.locator('nav').getByRole('button', { name: 'Alle Notizen', exact: true }).click();
  await list.getByText('Testnotiz Zitronenkuchen').click();
  await page.locator('article select').first().selectOption({ label: 'Rezepte' });
  await page.locator('nav').getByRole('button', { name: 'Rezepte', exact: true }).click();
  await expect(list.locator('[data-note]').count().then(n => n === 1), 'Notiz einem Notizbuch zugeordnet');

  // Favorit + Anheften + Duplizieren
  await page.getByRole('button', { name: 'Zu Favoriten hinzufügen' }).click();
  await page.getByRole('button', { name: 'Oben anheften' }).click();
  await page.getByRole('button', { name: 'Weitere Aktionen' }).click();
  await page.getByRole('menuitem', { name: 'Duplizieren' }).click();
  await expect(list.locator('[data-note]').count().then(n => n === 2), 'Notiz dupliziert');
  await page.locator('nav').getByRole('button', { name: 'Favoriten', exact: true }).click();
  await expect(list.getByText('Testnotiz Zitronenkuchen').count().then(n => n >= 1), 'Favorit erscheint unter Favoriten');

  // Markdown-Export
  await page.locator('nav').getByRole('button', { name: 'Rezepte', exact: true }).click();
  await list.getByText('Testnotiz Zitronenkuchen', { exact: true }).click();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Weitere Aktionen' }).click();
  await page.getByRole('menuitem', { name: 'Als Markdown exportieren' }).click();
  const file = await dl;
  const md = await (await file.createReadStream()).toArray().then(c => Buffer.concat(c).toString());
  await expect(Promise.resolve(md.startsWith('# Testnotiz Zitronenkuchen') && md.includes('- [ ] Backofen') && md.includes('**fetter Text')), 'Markdown-Export: ' + file.suggestedFilename());

  // Papierkorb, Wiederherstellen, Endgültig löschen
  await page.getByRole('button', { name: 'Weitere Aktionen' }).click();
  await page.getByRole('menuitem', { name: 'In den Papierkorb' }).click();
  await page.locator('nav').getByRole('button', { name: 'Papierkorb', exact: true }).click();
  await expect(list.getByText('Testnotiz Zitronenkuchen', { exact: true }).count().then(n => n === 1), 'Notiz liegt im Papierkorb');
  await list.getByText('Testnotiz Zitronenkuchen', { exact: true }).click();
  await page.getByRole('button', { name: 'Wiederherstellen' }).click();
  await page.locator('nav').getByRole('button', { name: 'Rezepte', exact: true }).click();
  await expect(list.getByText('Testnotiz Zitronenkuchen', { exact: true }).count().then(n => n === 1), 'Wiederhergestellt ins ursprüngliche Notizbuch');
  await list.getByText('Testnotiz Zitronenkuchen (Kopie)').click();
  await page.getByRole('button', { name: 'Weitere Aktionen' }).click();
  await page.getByRole('menuitem', { name: 'In den Papierkorb' }).click();
  await page.locator('nav').getByRole('button', { name: 'Papierkorb', exact: true }).click();
  await list.getByText('Testnotiz Zitronenkuchen (Kopie)').click();
  await page.locator('article').getByRole('button', { name: 'Endgültig löschen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Endgültig löschen' }).click();
  await expect(list.locator('[data-note]').count().then(n => n === 0), 'Endgültig gelöscht nach Rückfrage');

  // Notizbuch löschen → Notizen nach Unsortiert
  await page.locator('nav').getByRole('button', { name: 'Aktionen für „Rezepte“', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Löschen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Notizbuch löschen' }).click();
  await page.locator('nav').getByRole('button', { name: 'Unsortiert', exact: true }).click();
  await expect(list.getByText('Testnotiz Zitronenkuchen', { exact: true }).count().then(n => n === 1), 'Notizbuch gelöscht, Notiz in „Unsortiert“');

  // Joplin-Import über Einstellungen
  await page.locator('nav').getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page.getByText('Deine Notizen werden zurzeit nur auf diesem Gerät gespeichert.').waitFor();
  await page.screenshot({ path: shots + '/2-settings.png' });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '.jex-Datei importieren' }).click();
  await (await chooser).setFiles(jex);
  await page.getByText('Import abgeschlossen').waitFor({ timeout: 15000 });
  log(await page.getByText('Import abgeschlossen').innerText());
  await expect(page.locator('nav').getByRole('button', { name: 'Reisen', exact: true }).count().then(n => n === 1), 'Joplin-Notizbuch importiert');
  await list.getByText('Packliste Lissabon').click();
  await page.locator('.note-content img[alt=Logo]').first().waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.note-content img')].some(i => i.naturalWidth > 0));
  log('Importiertes Bild wird angezeigt');
  await expect(page.locator('.note-content table').count().then(n => n === 1), 'Tabelle übernommen');
  await expect(page.locator('.note-content ul[data-type=taskList] li[data-checked=true]').count().then(n => n === 1), 'Joplin-Checkliste übernommen');
  await expect(page.locator('article').getByText('#urlaub').count().then(n => n === 1), 'Joplin-Schlagwort übernommen');
  await page.screenshot({ path: shots + '/3-import.png' });
  await page.locator('.note-content a', { hasText: 'Evernote-Notiz' }).click();
  await expect(page.locator('#note-title').inputValue().then(v => v === 'Alte Evernote-Notiz'), 'Joplin-Notizlink öffnet Zielnotiz');
  await page.locator('nav').getByRole('button', { name: 'Papierkorb', exact: true }).click();
  await expect(list.getByText('Gelöschter Entwurf').count().then(n => n === 1), 'In Joplin gelöschte Notiz liegt im Papierkorb');

  // Re-Import: keine Duplikate
  const before = await page.evaluate(() => document.querySelectorAll('nav [aria-current]').length);
  await page.locator('nav').getByRole('button', { name: 'Alle Notizen', exact: true }).click();
  const countBefore = await list.locator('[data-note]').count();
  await page.locator('input[type=file]').last().setInputFiles(jex);
  await page.getByText('Import abgeschlossen').first().waitFor();
  await page.waitForTimeout(300);
  await expect(list.locator('[data-note]').count().then(n => n === countBefore), 'Erneuter Import erzeugt keine Duplikate');

  // Dark Mode
  await page.locator('nav').getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page.getByRole('radio', { name: 'Dunkel' }).click();
  await page.getByRole('button', { name: 'Fertig' }).click();
  await list.getByText('Packliste Lissabon').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: shots + '/4-dark.png' });
  await page.reload();
  await expect(page.evaluate(() => document.documentElement.classList.contains('dark')), 'Dark Mode bleibt nach Neuladen');

  // Smartphone
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'de-DE' });
  const p2 = await phone.newPage();
  p2.on('pageerror', e => errors.push('mobile pageerror: ' + e.message));
  await p2.goto(URL);
  await p2.getByText('Willkommen bei Notizen 👋').first().waitFor();
  await p2.screenshot({ path: shots + '/5-phone-list.png' });
  await p2.getByText('Wochenplan').click();
  await p2.getByRole('button', { name: 'Zurück zur Liste' }).waitFor();
  await p2.screenshot({ path: shots + '/6-phone-editor.png' });
  await p2.getByRole('button', { name: 'Zurück zur Liste' }).click();
  await p2.getByRole('button', { name: 'Navigation öffnen' }).click();
  await p2.screenshot({ path: shots + '/7-phone-nav.png' });
  await p2.getByRole('button', { name: 'Favoriten' }).click();
  await expect(p2.getByRole('heading', { name: 'Favoriten' }).isVisible(), 'Mobile Navigation: Schublade → Favoriten');

  // Tablet
  const tab = await browser.newContext({ viewport: { width: 900, height: 1180 }, locale: 'de-DE' });
  const p3 = await tab.newPage();
  await p3.goto(URL);
  await p3.getByText('Willkommen bei Notizen 👋').first().waitFor();
  await p3.screenshot({ path: shots + '/8-tablet.png' });

  console.log(errors.length ? '\nFEHLER IN DER KONSOLE:\n' + errors.join('\n') : '\nKeine Konsolenfehler.');
  await browser.close();
})().catch(async e => { console.error(e.message); try { await global.__page.screenshot({ path: shots + '/fail.png' }); console.log(await global.__page.locator('#main-list').innerText()); } catch {} process.exit(1); });
