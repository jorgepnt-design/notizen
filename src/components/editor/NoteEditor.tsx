'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Check,
  Copy,
  MessageCircle,
  Redo2,
  Share2,
  Undo2,
  Download,
  Loader2,
  MoreHorizontal,
  Pin,
  RotateCcw,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import {
  addAttachment,
  addTagToNote,
  deleteNoteForever,
  duplicateNote,
  editNote,
  flushSaves,
  moveNote,
  notify,
  removeTagFromNote,
  restoreNote,
  selectNote,
  toggleFavorite,
  togglePinned,
  trashNote,
  useNotes,
} from '@/store/notes';
import { ATTACHMENT_PREFIX, NOTE_PREFIX, attachmentIdOf, attachmentUrl } from '@/lib/attachments';
import { downloadNoteAsMarkdown } from '@/lib/markdown';
import { canShareNatively, shareNatively, shareViaWhatsApp } from '@/lib/share';
import { notebookPath } from '@/lib/query';
import { longDate } from '@/lib/format';
import { escapeHtml } from '@/lib/html';
import type { Id, Note } from '@/lib/types';
import { buildExtensions } from './extensions';
import { Toolbar } from './Toolbar';
import { Menu } from '../ui/Menu';
import { confirmDialog } from '../ui/dialogs';

interface Props {
  onBack: () => void;
}

export function NoteEditorPane({ onBack }: Props) {
  const selectedId = useNotes(s => s.selectedId);
  const note = useNotes(s => (s.selectedId ? s.notes[s.selectedId] : null));
  const remoteRev = useNotes(s => (s.selectedId ? s.remoteRev[s.selectedId] ?? 0 : 0));

  if (!note || !selectedId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-surface px-8 text-center">
        <BookOpen className="text-faint" size={36} />
        <p className="font-medium">Keine Notiz ausgewählt</p>
        <p className="max-w-xs text-sm text-muted">Wähle links eine Notiz aus oder lege mit „Neue Notiz“ eine an.</p>
      </div>
    );
  }
  // key: Beim Wechsel der Notiz (oder einer Änderung von einem anderen Gerät) wird der Editor
  // neu aufgebaut – vorher speichert er seinen Stand.
  return <NoteEditor key={`${note.id}:${remoteRev}`} note={note} onBack={onBack} />;
}

function NoteEditor({ note, onBack }: { note: Note; onBack: () => void }) {
  const notebooks = useNotes(s => s.notebooks);
  const tags = useNotes(s => s.tags);
  const attachments = useNotes(s => s.attachments);
  const fresh = useRef(Date.now() - note.createdAt < 2000 && !note.title && !note.content);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const inTrash = !!note.deletedAt;

  // Neuester Editor-Inhalt, der noch nicht im Store ist
  const pendingHtml = useRef<{ content: string; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flushContent = () => {
    clearTimeout(timer.current);
    if (pendingHtml.current) {
      editNote(note.id, pendingHtml.current);
      pendingHtml.current = null;
    }
  };
  const flushRef = useRef(flushContent);
  flushRef.current = flushContent;

  const editorRef = useRef<Editor | null>(null);
  const insertFiles = async (files: File[]) => {
    const ed = editorRef.current;
    if (!ed || !files.length) return;
    for (const file of files) {
      try {
        const meta = await addAttachment(file);
        const src = ATTACHMENT_PREFIX + meta.id;
        if (meta.mime.startsWith('image/')) ed.chain().focus().setImage({ src, alt: meta.name }).run();
        else ed.chain().focus().insertContent(`<a href="${src}">${escapeHtml(meta.name)}</a> `).run();
      } catch {
        /* Fehlermeldung kommt aus dem Store */
      }
    }
  };

  const editor = useEditor({
    extensions: useMemo(buildExtensions, []),
    content: note.content,
    editable: !inTrash,
    immediatelyRender: false,
    autofocus: false,
    editorProps: {
      attributes: { class: 'note-content', 'aria-label': 'Notizinhalt', 'aria-multiline': 'true', role: 'textbox' },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (!files.length) return false;
        event.preventDefault();
        void insertFiles(files);
        return true;
      },
      handleDrop: (_view, event) => {
        const files = Array.from((event as DragEvent).dataTransfer?.files ?? []);
        if (!files.length) return false;
        event.preventDefault();
        void insertFiles(files);
        return true;
      },
      handleClick: (_view, _pos, event) => {
        const a = (event.target as HTMLElement).closest('a');
        if (!a) return false;
        const href = a.getAttribute('href') || '';
        const attId = attachmentIdOf(href);
        if (attId) {
          event.preventDefault();
          const win = window.open('', '_blank');
          void attachmentUrl(attId).then(url => {
            if (url && win) win.location.href = url;
            else {
              win?.close();
              notify('Dieser Anhang ist nicht mehr vorhanden.', 'error');
            }
          });
          return true;
        }
        if (href.startsWith(NOTE_PREFIX)) {
          event.preventDefault();
          const target = href.slice(NOTE_PREFIX.length);
          if (useNotes.getState().notes[target]) selectNote(target);
          else notify('Die verlinkte Notiz gibt es hier nicht.', 'error');
          return true;
        }
        if (event.metaKey || event.ctrlKey || !editorRef.current?.isEditable) {
          window.open(href, '_blank', 'noopener,noreferrer');
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      pendingHtml.current = { content: editor.isEmpty ? '' : editor.getHTML(), text: editor.getText({ blockSeparator: '\n' }) };
      clearTimeout(timer.current);
      timer.current = setTimeout(() => flushRef.current(), 250);
    },
    onBlur: () => flushRef.current(),
  });
  editorRef.current = editor;

  // Beim Verlassen der Notiz den letzten Stand sofort übernehmen und speichern
  useEffect(
    () => () => {
      flushRef.current();
      void flushSaves();
    },
    [],
  );

  useEffect(() => {
    if (fresh.current) titleRef.current?.focus();
  }, []);

  // Titelfeld wächst mit
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [note.title]);

  const notebookOptions = useMemo(
    () =>
      Object.values(notebooks)
        .map(nb => ({ id: nb.id, path: notebookPath(nb.id, notebooks) }))
        .sort((a, b) => a.path.localeCompare(b.path, 'de')),
    [notebooks],
  );

  const askDeleteForever = async () => {
    const ok = await confirmDialog({
      title: 'Notiz endgültig löschen?',
      message: `„${note.title || 'Ohne Titel'}“ wird dauerhaft gelöscht. Das lässt sich nicht rückgängig machen.`,
      confirmLabel: 'Endgültig löschen',
      danger: true,
    });
    if (ok) {
      await deleteNoteForever(note.id);
      notify('Notiz endgültig gelöscht.');
    }
  };

  const exportMd = async () => {
    flushContent();
    try {
      await downloadNoteAsMarkdown(useNotes.getState().notes[note.id], attachments);
    } catch (e) {
      console.error(e);
      notify('Der Export ist fehlgeschlagen.', 'error');
    }
  };

  return (
    <article className="flex h-full min-w-0 flex-col bg-surface" aria-label="Editor">
      <header className="flex items-center gap-1 border-b border-line px-3 py-2 sm:px-5">
        <button className="icon-btn -ml-1 md:hidden" onClick={onBack} aria-label="Zurück zur Liste">
          <ArrowLeft size={20} />
        </button>
        <label className="flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted hover:bg-sunken">
          <BookOpen size={15} className="shrink-0" />
          <span className="sr-only">Notizbuch</span>
          <select
            className="min-w-0 max-w-[14rem] cursor-pointer truncate bg-transparent text-sm text-ink focus:outline-none"
            value={note.notebookId ?? ''}
            disabled={inTrash}
            onChange={e => moveNote(note.id, e.target.value || null)}
          >
            <option value="">Unsortiert</option>
            {notebookOptions.map(o => (
              <option key={o.id} value={o.id}>
                {o.path}
              </option>
            ))}
          </select>
        </label>
        <SaveIndicator />
        <span className="flex-1" />
        {!inTrash && (
          <>
            {editor && (
              <>
                <button
                  className="icon-btn"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => editor.chain().focus().undo().run()}
                  disabled={!editor.can().undo()}
                  aria-label="Rückgängig"
                  title="Rückgängig (Strg+Z)"
                >
                  <Undo2 size={18} />
                </button>
                <button
                  className="icon-btn"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => editor.chain().focus().redo().run()}
                  disabled={!editor.can().redo()}
                  aria-label="Wiederholen"
                  title="Wiederholen (Strg+Umschalt+Z)"
                >
                  <Redo2 size={18} />
                </button>
              </>
            )}
            <button
              className={`icon-btn ${note.favorite ? 'text-star hover:text-star' : ''}`}
              onClick={() => toggleFavorite(note.id)}
              aria-pressed={note.favorite}
              aria-label={note.favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
              title={note.favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
            >
              <Star size={18} className={note.favorite ? 'fill-current' : ''} />
            </button>
            <button
              className={`icon-btn hidden sm:inline-flex ${note.pinned ? 'text-accent hover:text-accent' : ''}`}
              onClick={() => togglePinned(note.id)}
              aria-pressed={note.pinned}
              aria-label={note.pinned ? 'Nicht mehr anheften' : 'Oben anheften'}
              title={note.pinned ? 'Nicht mehr anheften' : 'Oben anheften'}
            >
              <Pin size={18} className={note.pinned ? 'fill-current' : ''} />
            </button>
            <Menu
              label="Weitere Aktionen"
              trigger={<MoreHorizontal size={18} />}
              items={[
                { label: 'Per WhatsApp teilen', icon: <MessageCircle size={15} />, onSelect: () => { flushContent(); shareViaWhatsApp(useNotes.getState().notes[note.id]); } },
                canShareNatively() && { label: 'Teilen …', icon: <Share2 size={15} />, onSelect: () => { flushContent(); void shareNatively(useNotes.getState().notes[note.id]); } },
                { label: note.pinned ? 'Nicht mehr anheften' : 'Oben anheften', icon: <Pin size={15} />, onSelect: () => togglePinned(note.id) },
                { label: 'Duplizieren', icon: <Copy size={15} />, onSelect: () => { flushContent(); duplicateNote(note.id); } },
                { label: 'Als Markdown exportieren', icon: <Download size={15} />, onSelect: exportMd },
                { label: 'In den Papierkorb', icon: <Trash2 size={15} />, danger: true, onSelect: () => { flushContent(); trashNote(note.id); } },
              ]}
            />
          </>
        )}
      </header>

      {inTrash && (
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-danger-soft/60 px-5 py-2.5 text-sm" role="status">
          <Trash2 size={16} className="text-danger" />
          <span className="flex-1">Diese Notiz liegt im Papierkorb und kann nicht bearbeitet werden.</span>
          <button className="btn-secondary py-1.5" onClick={() => restoreNote(note.id)}>
            <RotateCcw size={15} /> Wiederherstellen
          </button>
          <button className="btn-danger py-1.5" onClick={askDeleteForever}>
            Endgültig löschen
          </button>
        </div>
      )}

      {editor && !inTrash && (
        <div className="sticky top-0 z-10 overflow-x-auto border-b border-line bg-surface/95 px-3 py-1.5 backdrop-blur sm:px-5">
          <Toolbar editor={editor} onAttach={insertFiles} />
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-5 pb-24 pt-6 sm:px-10">
          <label htmlFor="note-title" className="sr-only">
            Titel
          </label>
          <textarea
            id="note-title"
            ref={titleRef}
            rows={1}
            className="w-full resize-none overflow-hidden bg-transparent text-[28px] font-bold leading-tight tracking-tight text-ink placeholder:text-faint focus:outline-none"
            placeholder="Titel"
            value={note.title}
            readOnly={inTrash}
            onChange={e => editNote(note.id, { title: e.target.value.replace(/\n/g, ' ') })}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (!editor) return;
                // sofort fokussieren – focus() von Tiptap wirkt erst im nächsten Frame,
                // sonst landen schnell getippte Zeichen noch im Titel
                editor.view.focus();
                editor.commands.focus('start');
              }
            }}
          />

          <TagEditor noteId={note.id} tagIds={note.tagIds} tags={tags} readOnly={inTrash} />

          <div className="mt-6">
            <EditorContent editor={editor} />
          </div>

          <p className="mt-12 border-t border-line pt-3 text-xs text-muted">
            Erstellt {longDate(note.createdAt)} · Zuletzt geändert {longDate(note.updatedAt)}
          </p>
        </div>
      </div>
    </article>
  );
}

function SaveIndicator() {
  const state = useNotes(s => s.saveState);
  if (state === 'error')
    return (
      <span className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-2.5 py-1 text-xs font-medium text-danger" role="alert">
        <AlertCircle size={14} /> Nicht gespeichert
        <button className="underline underline-offset-2" onClick={() => void flushSaves()}>
          Erneut versuchen
        </button>
      </span>
    );
  const saving = state === 'pending' || state === 'saving';
  return (
    <span className="ml-1 inline-flex shrink-0 items-center gap-1.5 text-xs text-muted" role="status" aria-live="polite" title={saving ? 'Speichert …' : 'Gespeichert'}>
      {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} className="text-accent" />}
      <span className="sr-only sm:not-sr-only">{saving ? 'Speichert …' : 'Gespeichert'}</span>
    </span>
  );
}

function TagEditor({ noteId, tagIds, tags, readOnly }: { noteId: Id; tagIds: Id[]; tags: Record<Id, { id: Id; name: string }>; readOnly: boolean }) {
  const [value, setValue] = useState('');
  const listId = `tags-${noteId}`;
  const add = () => {
    const parts = value.split(',').map(s => s.trim()).filter(Boolean);
    parts.forEach(p => void addTagToNote(noteId, p));
    setValue('');
  };
  const suggestions = Object.values(tags).filter(t => !tagIds.includes(t.id));

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {tagIds.map(id =>
        tags[id] ? (
          <span key={id} className="inline-flex items-center gap-1 rounded-full bg-accent-soft py-0.5 pl-2.5 pr-1 text-xs font-medium text-accent-strong">
            #{tags[id].name}
            {!readOnly && (
              <button className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-accent/20" onClick={() => removeTagFromNote(noteId, id)} aria-label={`Schlagwort „${tags[id].name}“ entfernen`}>
                <X size={12} />
              </button>
            )}
          </span>
        ) : null,
      )}
      {!readOnly && (
        <>
          <input
            className="min-w-[10rem] flex-1 rounded-md bg-transparent px-1 py-1 text-xs text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
            placeholder={tagIds.length ? 'Weiteres Schlagwort …' : '+ Schlagwort hinzufügen'}
            aria-label="Schlagwort hinzufügen"
            list={listId}
            value={value}
            onChange={e => {
              const v = e.target.value;
              // Auswahl aus der Vorschlagsliste (kein Tippen) direkt übernehmen
              const picked = (e.nativeEvent as InputEvent).inputType === 'insertReplacementText' || !(e.nativeEvent as InputEvent).inputType;
              if (picked && suggestions.some(t => t.name === v)) {
                void addTagToNote(noteId, v);
                setValue('');
              } else setValue(v);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                add();
              } else if (e.key === 'Backspace' && !value && tagIds.length) {
                removeTagFromNote(noteId, tagIds[tagIds.length - 1]);
              }
            }}
            onBlur={() => value.trim() && add()}
          />
          <datalist id={listId}>
            {suggestions.map(t => (
              <option key={t.id} value={t.name} />
            ))}
          </datalist>
        </>
      )}
    </div>
  );
}
