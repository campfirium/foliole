import type { PDFPageProxy } from 'pdfjs-dist';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';

import { useWorkspaceStore } from '../../store/workspaceStore';

import type { PdfHighlightLocator } from './pdfHighlightLocators';
import { rotatePdfNormalizedRect, unrotatePdfNormalizedRect, type PdfNormalizedRect } from './pdfVisualExcerptGeometry';
import { renderPdfVisualExcerpt } from './pdfVisualExcerptRenderer';

interface PdfVisualExcerptRequest { page: number; rect: PdfNormalizedRect }
export interface PdfVisualExcerptSelection { nodeId: string; page: number; x: number; y: number }

interface PdfVisualExcerptRuntimeValue {
  creating: boolean;
  error: PdfVisualExcerptRequest | null;
  imageLocators: PdfHighlightLocator[];
  pending: PdfVisualExcerptRequest | null;
  rotation: number;
  selectedOutline: PdfVisualExcerptSelection | null;
  clearOutlineSelection: () => void;
  createDisplayedRect: (page: number, rect: PdfNormalizedRect) => Promise<void>;
  deleteSelectedOutline: () => void;
  openExcerpt: (nodeId: string) => void;
  registerPage: (pageNumber: number, page: PDFPageProxy) => void;
  retry: () => Promise<void>;
  selectOutline: (selection: PdfVisualExcerptSelection) => void;
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

function usePdfExcerptCreation(props: { nodeId: string | null; rotation: number }, pagesRef: MutableRefObject<Map<number, PDFPageProxy>>) {
  const createExcerpt = useWorkspaceStore((state) => state.createPdfImageExcerpt);
  const creatingRef = useRef(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<PdfVisualExcerptRequest | null>(null);
  const [pending, setPending] = useState<PdfVisualExcerptRequest | null>(null);
  const createRequest = useCallback(async (request: PdfVisualExcerptRequest) => {
    if (!props.nodeId || creatingRef.current) return;
    const page = pagesRef.current.get(request.page);
    if (!page) { setError(request); return; }
    creatingRef.current = true; setCreating(true); setError(null); setPending(request);
    try {
      const sourceRect = unrotatePdfNormalizedRect(request.rect, props.rotation);
      const bytes = await renderPdfVisualExcerpt(page, sourceRect);
      const attachmentId = await hashBytes(bytes);
      const locator = { page: request.page, x: sourceRect.x, y: sourceRect.y, rects: [sourceRect] };
      const created = await createExcerpt?.(props.nodeId, request.page, locator, attachmentId, encodeBytes(bytes));
      if (!created) throw new Error('The image excerpt could not be saved.');
      setPending(null);
    } catch {
      setError(request);
    } finally { creatingRef.current = false; setCreating(false); }
  }, [createExcerpt, pagesRef, props.nodeId, props.rotation]);
  const reset = useCallback(() => { setError(null); setPending(null); }, []);
  return { createRequest, creating, error, pending, reset };
}

function useSelectedPdfOutline(deleteAnnotations: (nodeIds: string[]) => void, currentPage: number) {
  const [selected, setSelected] = useState<PdfVisualExcerptSelection | null>(null);
  useEffect(() => setSelected(null), [currentPage]);
  useEffect(() => {
    const clear = () => setSelected(null);
    window.addEventListener('blur', clear);
    return () => window.removeEventListener('blur', clear);
  }, []);
  useEffect(() => {
    if (!selected) return undefined;
    const clearFromOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-annotation-toolbar="true"]')) return;
      setSelected(null);
    };
    window.addEventListener('pointerdown', clearFromOutsidePointer, true);
    return () => window.removeEventListener('pointerdown', clearFromOutsidePointer, true);
  }, [selected]);
  useEffect(() => {
    if (!selected) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!['Backspace', 'Delete'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing || event.repeat) return;
      event.preventDefault(); event.stopImmediatePropagation(); deleteAnnotations([selected.nodeId]); setSelected(null);
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [deleteAnnotations, selected]);
  return { selected, setSelected };
}

export function PdfVisualExcerptRuntimeProvider(props: {
  children: ReactNode;
  currentPage: number;
  locators: PdfHighlightLocator[];
  nodeId: string | null;
  rotation: number;
  source: string;
}) {
  const deleteAnnotations = useWorkspaceStore((state) => state.deleteEditorAnnotationNodes);
  const openNode = useWorkspaceStore((state) => state.openNode);
  const pagesRef = useRef(new Map<number, PDFPageProxy>());
  const creation = usePdfExcerptCreation(props, pagesRef);
  const selection = useSelectedPdfOutline(deleteAnnotations, props.currentPage);
  useEffect(() => {
    creation.reset(); selection.setSelected(null); pagesRef.current.clear();
  }, [creation.reset, props.nodeId, props.source, selection.setSelected]);

  const value = useMemo<PdfVisualExcerptRuntimeValue>(() => ({
    clearOutlineSelection: () => selection.setSelected(null),
    createDisplayedRect: (page, rect) => creation.createRequest({ page, rect }),
    creating: creation.creating, error: creation.error,
    deleteSelectedOutline: () => {
      if (!selection.selected) return;
      deleteAnnotations([selection.selected.nodeId]); selection.setSelected(null);
    },
    imageLocators: props.locators.filter((locator) => locator.kind === 'image-excerpt'),
    openExcerpt: (nodeId) => { openNode(nodeId); },
    pending: creation.pending,
    registerPage: (pageNumber, page) => { pagesRef.current.set(pageNumber, page); },
    retry: () => creation.error ? creation.createRequest(creation.error) : Promise.resolve(),
    rotation: props.rotation,
    selectedOutline: selection.selected,
    selectOutline: selection.setSelected
  }), [creation, deleteAnnotations, openNode, props.locators, props.rotation, selection]);
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
