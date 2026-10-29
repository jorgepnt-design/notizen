'use client';

import { useState } from 'react';
import { create } from 'zustand';
import { Modal } from './Modal';

type Request = { seq: number } & (
  | { kind: 'confirm'; title: string; message: string; confirmLabel: string; danger?: boolean; resolve: (v: boolean) => void }
  | { kind: 'prompt'; title: string; label: string; initial: string; confirmLabel: string; resolve: (v: string | null) => void }
);

let seq = 0;
const useDialog = create<{ request: Request | null }>(() => ({ request: null }));

/** Fragt nach einer Bestätigung. Liefert `true`, wenn bestätigt wurde. */
export function confirmDialog(opts: { title: string; message: string; confirmLabel?: string; danger?: boolean }) {
  return new Promise<boolean>(resolve =>
    useDialog.setState({ request: { seq: ++seq, kind: 'confirm', confirmLabel: 'OK', ...opts, resolve } }),
  );
}

/** Fragt einen kurzen Text ab (z. B. einen Namen). Liefert `null` bei Abbruch. */
export function promptDialog(opts: { title: string; label: string; initial?: string; confirmLabel?: string }) {
  return new Promise<string | null>(resolve =>
    useDialog.setState({ request: { seq: ++seq, kind: 'prompt', initial: '', confirmLabel: 'Speichern', ...opts, resolve } }),
  );
}

export function DialogHost() {
  const request = useDialog(s => s.request);
  if (!request) return null;
  return <DialogView key={request.seq} request={request} />;
}

function DialogView({ request }: { request: Request }) {
  const [value, setValue] = useState(request.kind === 'prompt' ? request.initial : '');
  const done = (result: boolean) => {
    useDialog.setState({ request: null });
    if (request.kind === 'confirm') request.resolve(result);
    else request.resolve(result && value.trim() ? value.trim() : null);
  };

  return (
    <Modal
      title={request.title}
      onClose={() => done(false)}
      footer={
        <>
          <button className="btn-secondary" onClick={() => done(false)}>
            Abbrechen
          </button>
          <button
            className={request.kind === 'confirm' && request.danger ? 'btn-danger' : 'btn-primary'}
            onClick={() => done(true)}
            disabled={request.kind === 'prompt' && !value.trim()}
            data-autofocus={request.kind === 'confirm' ? true : undefined}
          >
            {request.confirmLabel}
          </button>
        </>
      }
    >
      {request.kind === 'confirm' ? (
        <p className="leading-relaxed text-muted">{request.message}</p>
      ) : (
        <form
          onSubmit={e => {
            e.preventDefault();
            if (value.trim()) done(true);
          }}
        >
          <label className="mb-1.5 block font-medium" htmlFor="prompt-input">
            {request.label}
          </label>
          <input
            id="prompt-input"
            className="field"
            value={value}
            onChange={e => setValue(e.target.value)}
            onFocus={e => e.target.select()}
            data-autofocus
            maxLength={120}
          />
        </form>
      )}
    </Modal>
  );
}
