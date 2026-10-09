import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useRef, useState } from 'react';

import { measurePdfAutomaticView } from '../model/measurePdfAutomaticView';
import {
  DEFAULT_PDF_READING_VIEW,
  FULL_PDF_VIEW,
  PDF_AUTOMATIC_VIEW_VERSION,
  type PdfReadingView
} from '../model/pdfReadingView';
import { loadPdfReadingView, savePdfReadingView } from '../model/pdfReadingViewRepository';

function useViewState(page: number) {
  const [fitPage, setFitPage] = useState(page);
  const [revision, setRevision] = useState(0);
  const [view, setView] = useState(DEFAULT_PDF_READING_VIEW);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState(false);
  const fingerprint = useRef('');
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return {
    view,
    setView,
    fitPage,
    setFitPage,
    revision,
    setRevision,
    ready,
    setReady,
    busy,
    setBusy,
    error,
    setError,
    editing,
    setEditing,
    fingerprint,
    pdfRef,
    alive
  };
}
type State = ReturnType<typeof useViewState>;
function initializeView(state: State) {
  return async (pdf: PDFDocumentProxy) => {
    state.pdfRef.current = pdf;
    const id = pdf.fingerprints[0];
    if (!id) {
      state.setError(true);
      state.setReady(true);
      return;
    }
    if (state.fingerprint.current === id) return;
    state.fingerprint.current = id;
    try {
      const saved = await loadPdfReadingView(id);
      if (state.alive.current) state.setView(saved);
      const current = saved.automatic && saved.automaticVersion === PDF_AUTOMATIC_VIEW_VERSION;
      const next = current
        ? saved
        : { ...saved, automatic: await measurePdfAutomaticView(pdf), automaticVersion: PDF_AUTOMATIC_VIEW_VERSION };
      if (!state.alive.current) return;
      if (!current) await savePdfReadingView(id, next);
      if (state.alive.current) {
        state.setView(next);
        state.setReady(true);
        state.setError(false);
      }
    } catch {
      if (state.alive.current) {
        state.setError(true);
        state.setReady(true);
      }
    }
  };
}
function persistView(state: State) {
  return async (next: PdfReadingView) => {
    if (!state.fingerprint.current || state.busy) return false;
    state.setBusy(true);
    state.setError(false);
    try {
      await savePdfReadingView(state.fingerprint.current, next);
      if (state.alive.current) {
        state.setView(next);
        state.setEditing(false);
        state.setRevision((value) => value + 1);
        return true;
      }
    } catch {
      if (state.alive.current) state.setError(true);
      return false;
    } finally {
      if (state.alive.current) state.setBusy(false);
    }
  };
}
export function usePdfReadingViewRuntime(page: number) {
  const state = useViewState(page);
  const initialize = initializeView(state);
  const save = persistView(state);
  const persist = async (next: PdfReadingView) => {
    const saved = await save(next);
    if (saved) state.setFitPage(page);
    return saved;
  };
  return {
    range:
      (state.view.mode === 'manual' ? state.view.manual : state.view.automatic) ?? FULL_PDF_VIEW,
    view: state.view,
    page,
    fitPage: state.fitPage,
    revision: state.revision,
    fitToPage: state.setFitPage,
    chooseFree: () => persist({ ...state.view, mode: 'free' }),
    ready: state.ready,
    busy: state.busy,
    error: state.error,
    editing: state.editing,
    initialize,
    chooseAutomatic: () => {
      if ((!state.view.automatic || state.view.automaticVersion !== PDF_AUTOMATIC_VIEW_VERSION) && state.pdfRef.current) {
        state.fingerprint.current = '';
        void initialize(state.pdfRef.current);
      } else void persist({ ...state.view, mode: 'auto' });
    },
    chooseManual: () => {
      if (state.view.manual) void persist({ ...state.view, mode: 'manual' });
      else state.setEditing(true);
    },
    adjust: () => state.setEditing(true),
    cancel: () => {
      if (!state.busy) state.setEditing(false);
    },
    confirm: (rect: NonNullable<PdfReadingView['manual']>) =>
      persist({ ...state.view, mode: 'manual', manual: rect })
  };
}
