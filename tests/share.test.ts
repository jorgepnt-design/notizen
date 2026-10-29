import { describe, expect, it } from 'vitest';
import { noteToWhatsApp } from '@/lib/share';
import type { Note } from '@/lib/types';

const note = (title: string, content: string): Note => ({
  id: 'x', title, content, text: '', notebookId: null, tagIds: [], favorite: false, pinned: false, createdAt: 0, updatedAt: 0, deletedAt: null,
});

describe('Teilen per WhatsApp', () => {
  it('übernimmt Formatierung, Listen und Checklisten', () => {
    const text = noteToWhatsApp(
      note(
        'Einkauf',
        '<h2>Heute</h2><p>Bitte <strong>schnell</strong> und <em>günstig</em></p>' +
          '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox"></label><div><p>Milch</p></div></li>' +
          '<li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>Brot</p></div></li></ul>' +
          '<ol><li><p>Erstens</p></li><li><p>Zweitens</p></li></ol><p><a href="https://example.com">Laden</a></p>',
      ),
    );
    expect(text).toBe('*Einkauf*\n\n*Heute*\nBitte *schnell* und _günstig_\n☑ Milch\n☐ Brot\n1. Erstens\n2. Zweitens\nLaden (https://example.com)');
  });

  it('kürzt sehr lange Notizen', () => {
    expect(noteToWhatsApp(note('Lang', `<p>${'a'.repeat(5000)}</p>`)).length).toBe(4000);
  });
});
