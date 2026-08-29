import type { PDFPageProxy } from 'pdfjs-dist';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useWorkspaceStore } from '../../store/workspaceStore';

import type { PdfHighlightLocator } from './pdfHighlightLocators';
import { rotatePdfNormalizedRect, unrotatePdfNormalizedRect, type PdfNormalizedRect } from './pdfVisualExcerptGeometry';
import { renderPdfVisualExcerpt } from './pdfVisualExcerptRenderer';

interface PdfVisualExcerptDraft { page: number; rect: PdfNormalizedRect }

interface PdfVisualExcerptRuntimeValue {
  active: boolean;
  creating: boolean;
  draft: PdfVisualExcerptDraft | null;
  error: string | null;
  imageLocators: PdfHighlightLocator[];
  rotation: number;
  cancel: () => void;
  confirm: () => Promise<void>;
  openExcerpt: (nodeId: string) => void;
  registerPage: (pageNumber: number, page: PDFPageProxy) => void;
  selectDisplayedRect: (page: number, rect: PdfNormalizedRect) => void;
  selectFullPage: () => void;
  toggle: () => void;
}

const PdfVisualExcerptRuntimeContext = createContext<PdfVisualExcerptRuntimeValue | null>(null);

function encodeBytes(bytes: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function hashBytes(bytes: Uint8Array) {
  const copy = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

export function PdfVisualExcerptRuntimeProvider(props: {
  children: ReactNode;
  currentPage: number;
  locators: PdfHighlightLocator[];
  nodeId: string | null;
  rotation: number;
  source: string;
}) {
  const createExcerpt = useWorkspaceStore((state) => state.createPdfImageExcerpt);
  const openNode = useWorkspaceStore((state) => state.openNode);
  const pagesRef = useRef(new Map<number, PDFPageProxy>());
  const [active, setActive] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<PdfVisualExcerptDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setActive(false); setDraft(null); setError(null); pagesRef.current.clear();
  }, [props.nodeId, props.source]);

  const cancel = useCallback(() => { setActive(false); setDraft(null); setError(null); }, []);
  const confirm = useCallback(async () => {
    if (!draft || !props.nodeId || creating) return;
    const page = pagesRef.current.get(draft.page);
    if (!page) { setError('This PDF page is not ready yet.'); return; }
    setCreating(true); setError(null);
    try {
      const bytes = await renderPdfVisualExcerpt(page, draft.rect);
      const attachmentId = await hashBytes(bytes);
      const locator = { page: draft.page, x: draft.rect.x, y: draft.rect.y, rects: [draft.rect] };
      const created = await createExcerpt?.(props.nodeId, draft.page, locator, attachmentId, encodeBytes(bytes));
      if (!created) throw new Error('The image excerpt could not be saved.');
      setActive(false); setDraft(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The image excerpt could not be saved.');
    } finally { setCreating(false); }
  }, [createExcerpt, creating, draft, props.nodeId]);

  const value = useMemo<PdfVisualExcerptRuntimeValue>(() => ({
    active, cancel, confirm, creating, draft, error,
    imageLocators: props.locators.filter((locator) => locator.kind === 'image-excerpt'),
    openExcerpt: (nodeId) => { openNode(nodeId); },
    registerPage: (pageNumber, page) => { pagesRef.current.set(pageNumber, page); },
    rotation: props.rotation,
    selectDisplayedRect: (page, rect) => { setDraft({ page, rect: unrotatePdfNormalizedRect(rect, props.rotation) }); setError(null); },
    selectFullPage: () => { setActive(true); setDraft({ page: props.currentPage, rect: { x: 0, y: 0, width: 1, height: 1 } }); setError(null); },
    toggle: () => { setActive((value) => !value); setDraft(null); setError(null); }
  }), [active, cancel, confirm, creating, draft, error, openNode, props.currentPage, props.locators, props.rotation]);
  return <PdfVisualExcerptRuntimeContext.Provider value={value}>{props.children}</PdfVisualExcerptRuntimeContext.Provider>;
}

export function usePdfVisualExcerptRuntime() {
  const value = useOptionalPdfVisualExcerptRuntime();
  if (!value) throw new Error('PDF visual excerpt runtime is unavailable.');
  return value;
}

export function useOptionalPdfVisualExcerptRuntime() {
  return useContext(PdfVisualExcerptRuntimeContext);
}

export function resolveDisplayedExcerptRect(rect: PdfNormalizedRect, rotation: number) {
  return rotatePdfNormalizedRect(rect, rotation);
}
