'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNotes } from '@/store/notes';
import type { View } from '@/lib/query';
import type { Id } from '@/lib/types';

type Pane = 'list' | 'editor';
interface NavState {
  view: View;
  selectedId: Id | null;
  pane: Pane;
  depth: number;
}

const viewKey = (v: View) => ('id' in v ? `${v.type}:${v.id}` : v.type);

/**
 * Verknüpft Ansicht, geöffnete Notiz und (auf dem Handy) den sichtbaren Bereich mit dem
 * Browser-Verlauf. So funktionieren der Zurück-Knopf der App, die Zurück-Taste unter
 * Android und die Wischgeste in Safari gleich.
 */
export function useNavHistory(pane: Pane, setPane: (p: Pane) => void) {
  const ready = useNotes(s => s.ready);
  const view = useNotes(s => s.view);
  const selectedId = useNotes(s => s.selectedId);
  const [depth, setDepth] = useState(0);
  const last = useRef<{ view: string; selectedId: Id | null; pane: Pane } | null>(null);
  const restoring = useRef(false);
  const depthRef = useRef(0);

  // Ausgangszustand
  useEffect(() => {
    if (!ready || last.current) return;
    last.current = { view: viewKey(view), selectedId, pane };
    history.replaceState({ nz: { view, selectedId, pane, depth: 0 } satisfies NavState }, '');
  }, [ready, view, selectedId, pane]);

  // Jede Navigation als Eintrag im Verlauf festhalten
  useEffect(() => {
    const prev = last.current;
    if (!prev) return;
    const now = { view: viewKey(view), selectedId, pane };
    if (prev.view === now.view && prev.selectedId === now.selectedId && prev.pane === now.pane) return;
    last.current = now;
    if (restoring.current) {
      restoring.current = false;
      return;
    }
    // Automatische Auswahl (erste Notiz) oder Wegfall einer Notiz ersetzt den Eintrag nur
    const onlyAutoSelect = prev.view === now.view && prev.pane === now.pane && (prev.selectedId === null || now.selectedId === null);
    if (onlyAutoSelect) {
      history.replaceState({ nz: { view, selectedId, pane, depth: depthRef.current } satisfies NavState }, '');
    } else {
      depthRef.current += 1;
      setDepth(depthRef.current);
      history.pushState({ nz: { view, selectedId, pane, depth: depthRef.current } satisfies NavState }, '');
    }
  }, [view, selectedId, pane]);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const s = (e.state as { nz?: NavState } | null)?.nz;
      if (!s) return;
      restoring.current = true;
      const exists = s.selectedId && useNotes.getState().notes[s.selectedId];
      useNotes.setState({ view: s.view, selectedId: exists ? s.selectedId : null, filters: {} });
      setPane(s.pane);
      depthRef.current = s.depth;
      setDepth(s.depth);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [setPane]);

  const back = useCallback(() => history.back(), []);
  return { canGoBack: depth > 0, back };
}
