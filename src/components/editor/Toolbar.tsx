'use client';

import { useRef, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Paperclip,
  Quote,
  Redo2,
  SquareCode,
  Strikethrough,
  Undo2,
} from 'lucide-react';
import { promptDialog } from '../ui/dialogs';

interface Props {
  editor: Editor;
  onAttach: (files: File[]) => void;
}

export function Toolbar({ editor, onAttach }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const chain = () => editor.chain().focus();

  const editLink = async () => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = await promptDialog({
      title: prev ? 'Link bearbeiten' : 'Link einfügen',
      label: 'Adresse (leer lassen zum Entfernen)',
      initial: prev ?? 'https://',
      confirmLabel: 'Übernehmen',
    });
    if (url === null) {
      editor.commands.focus();
      return;
    }
    const href = /^[a-z][\w+.-]*:/i.test(url) ? url : `https://${url}`;
    if (editor.state.selection.empty && !editor.isActive('link')) {
      chain().insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href } }] }).run();
    } else {
      chain().extendMarkRange('link').setLink({ href }).run();
    }
  };

  return (
    <div role="toolbar" aria-label="Formatierung" className="flex w-max items-center gap-0.5">
      <Btn label="Überschrift 1 (Strg+Alt+1)" active={editor.isActive('heading', { level: 1 })} onClick={() => chain().toggleHeading({ level: 1 }).run()}>
        <Heading1 size={17} />
      </Btn>
      <Btn label="Überschrift 2 (Strg+Alt+2)" active={editor.isActive('heading', { level: 2 })} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
        <Heading2 size={17} />
      </Btn>
      <Btn label="Überschrift 3 (Strg+Alt+3)" active={editor.isActive('heading', { level: 3 })} onClick={() => chain().toggleHeading({ level: 3 }).run()}>
        <Heading3 size={17} />
      </Btn>
      <Sep />
      <Btn label="Fett (Strg+B)" active={editor.isActive('bold')} onClick={() => chain().toggleBold().run()}>
        <Bold size={17} />
      </Btn>
      <Btn label="Kursiv (Strg+I)" active={editor.isActive('italic')} onClick={() => chain().toggleItalic().run()}>
        <Italic size={17} />
      </Btn>
      <Btn label="Durchgestrichen" active={editor.isActive('strike')} onClick={() => chain().toggleStrike().run()}>
        <Strikethrough size={17} />
      </Btn>
      <Btn label="Code" active={editor.isActive('code')} onClick={() => chain().toggleCode().run()}>
        <Code size={17} />
      </Btn>
      <Sep />
      <Btn label="Aufzählung" active={editor.isActive('bulletList')} onClick={() => chain().toggleBulletList().run()}>
        <List size={17} />
      </Btn>
      <Btn label="Nummerierte Liste" active={editor.isActive('orderedList')} onClick={() => chain().toggleOrderedList().run()}>
        <ListOrdered size={17} />
      </Btn>
      <Btn label="Checkliste" active={editor.isActive('taskList')} onClick={() => chain().toggleTaskList().run()}>
        <ListChecks size={17} />
      </Btn>
      <Sep />
      <Btn label="Zitat" active={editor.isActive('blockquote')} onClick={() => chain().toggleBlockquote().run()}>
        <Quote size={17} />
      </Btn>
      <Btn label="Codeblock" active={editor.isActive('codeBlock')} onClick={() => chain().toggleCodeBlock().run()}>
        <SquareCode size={17} />
      </Btn>
      <Btn label="Link" active={editor.isActive('link')} onClick={editLink}>
        <Link2 size={17} />
      </Btn>
      <Btn label="Bild oder Datei anhängen" onClick={() => fileInput.current?.click()}>
        <Paperclip size={17} />
      </Btn>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={e => {
          onAttach(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      <Sep />
      <Btn label="Rückgängig (Strg+Z)" disabled={!editor.can().undo()} onClick={() => chain().undo().run()}>
        <Undo2 size={17} />
      </Btn>
      <Btn label="Wiederholen (Strg+Umschalt+Z)" disabled={!editor.can().redo()} onClick={() => chain().redo().run()}>
        <Redo2 size={17} />
      </Btn>
    </div>
  );
}

function Btn({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`icon-btn h-8 w-8 ${active ? 'bg-accent-soft text-accent-strong hover:bg-accent-soft hover:text-accent-strong' : ''}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="mx-1 h-5 w-px bg-line" aria-hidden />;
