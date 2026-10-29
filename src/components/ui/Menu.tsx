'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
}

interface Props {
  label: string;
  trigger: ReactNode;
  items: (MenuItem | false | null | undefined)[];
  align?: 'left' | 'right';
  triggerClassName?: string;
}

/** Aufklappmenü mit Tastaturbedienung (Pfeiltasten, Escape). */
export function Menu({ label, trigger, items, align = 'right', triggerClassName = 'icon-btn' }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  const list = items.filter(Boolean) as MenuItem[];

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus();
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const onKey = (e: React.KeyboardEvent) => {
    const els = Array.from(root.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? []);
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
      button.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      els[(i + 1) % els.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      els[(i - 1 + els.length) % els.length]?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={root} onKeyDown={open ? onKey : undefined}>
      <button
        ref={button}
        type="button"
        className={triggerClassName}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={e => {
          e.stopPropagation();
          setOpen(o => !o);
        }}
      >
        {trigger}
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          aria-label={label}
          className={`absolute z-40 mt-1 min-w-[13rem] overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-xl ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {list.map(item => (
            <button
              key={item.label}
              role="menuitem"
              type="button"
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm outline-none hover:bg-sunken focus-visible:bg-sunken focus-visible:outline-none ${item.danger ? 'text-danger' : 'text-ink'}`}
              onClick={e => {
                e.stopPropagation();
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.icon && <span className="text-muted">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
