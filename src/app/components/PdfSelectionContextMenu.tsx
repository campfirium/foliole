import { Highlighter, MessageSquare, SquaresSubtract } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';

import { formatHighlightCardContent } from '../../../lib/core/annotations/textAnnotationContent';
import { getHighlightAnnotationPrefix } from '../../features/editor/model/highlightAnnotationPrefixSetting';
import type { PdfSelectionLocator } from '../../features/nodes/model/nodeTypes';
import { cn } from '../../shared/lib/utils';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { appFloatingSurfaceClassName } from '../../shared/ui';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { normalizeContextMenuPosition } from '../contextCommands';

import { AnnotationNotePanel } from './AnnotationNotePanel';
import { AnnotationToolbarButton } from './AnnotationToolbarButton';
import {
  resolveContextMenuSelection,
  resolvePdfSelectionSnapshot,
  useTrackPdfSelection,
  type PdfSelectionSnapshot
} from './pdfSelectionRuntime';
import { setPdfVisualSelectionKind, type PdfSelectionAnnotationKind } from './pdfSurfaceRegistration';
import { usePdfSelectionToolbar } from './usePdfSelectionToolbar';

type PdfSelectionMenu = Pick<PdfSelectionSnapshot, 'locator' | 'selectionText'> & { left: number; top: number };

function usePdfSelectionDocumentReset(nodeId: string | null, reset: () => void) {
  const currentReset = useRef(reset);
  currentReset.current = reset;
  useEffect(() => {
    currentReset.current();
    window.getSelection()?.removeAllRanges();
    return () => { window.getSelection()?.removeAllRanges(); };
  }, [nodeId]);
}

function usePdfSelectionMenuState(nodeId: string | null) {
  const [noteDraft, setNoteDraft] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [selectionMenuState, setSelectionMenuState] = useState<PdfSelectionMenu | null>(null);
  const [liveSelectionOverlayLocator, setSelectionOverlayLocator] = useState<PdfSelectionLocator | undefined>(undefined);
  const selectionOverlayLocator = liveSelectionOverlayLocator ?? selectionMenuState?.locator;
  const surfaceRef = useRef<HTMLElement | null>(null);
  const preservedSelectionRef = useRef<PdfSelectionSnapshot | null>(null);
  usePdfSelectionDocumentReset(nodeId, () => {
    preservedSelectionRef.current = null;
    setSelectionMenuState(null);
    setSelectionOverlayLocator(undefined);
    setNoteOpen(false);
    setNoteDraft('');
  });
  const closeSelectionMenu = () => {
    setSelectionMenuState(null);
    setSelectionOverlayLocator(resolvePdfSelectionSnapshot(surfaceRef.current)?.locator);
    setNoteOpen(false);
    setNoteDraft('');
  };
  const openSelectionToolbar = (
    selection: Pick<PdfSelectionSnapshot, 'locator' | 'selectionText'>,
    position: { left: number; top: number }
  ) => {
    setSelectionMenuState({
      ...position,
      locator: selection.locator,
      selectionText: selection.selectionText
    });
    setSelectionOverlayLocator(selection.locator);
  };
  useTrackPdfSelection(surfaceRef, preservedSelectionRef, setSelectionOverlayLocator);
  usePdfSelectionToolbar({ onClose: closeSelectionMenu, onOpen: openSelectionToolbar, surfaceRef });
  const handleContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    const fallbackSelection = resolveContextMenuSelection(surfaceRef.current, preservedSelectionRef.current);
    if (!fallbackSelection?.selectionText) {
      setSelectionMenuState(null);
      setSelectionOverlayLocator(undefined);
      return;
    }
    event.preventDefault();
    const position = normalizeContextMenuPosition(event.clientX, event.clientY);
    openSelectionToolbar(fallbackSelection, position);
  };
  return {
    closeSelectionMenu,
    handleContextMenu,
    noteDraft,
    noteOpen,
    openSelectionToolbar,
    preservedSelectionRef,
    selectionMenuState,
    selectionOverlayLocator,
    setNoteDraft,
    setNoteOpen,
    surfaceRef
  };
}

function usePdfSelectionAnnotationActions(args: { menu: ReturnType<typeof usePdfSelectionMenuState>; nodeId: string | null; onCreateHighlightFromSelection: ((selectionText: string, locator: PdfSelectionLocator) => boolean | Promise<boolean>) | undefined }) {
  const createHighlight = useWorkspaceStore((state) => state.createHighlightNodeFromSelection);
  const createCloze = useWorkspaceStore((state) => state.createQANodeFromSelection);
  const { menu } = args;
  const savingRef = useRef(false);
  const finishCreation = (created: boolean) => {
    if (created) {
      window.getSelection()?.removeAllRanges();
      menu.preservedSelectionRef.current = null;
    }
    if (created) menu.closeSelectionMenu();
  };
  const applySelectionAnnotation = async (kind: PdfSelectionAnnotationKind, note = '') => {
    const selection = menu.selectionMenuState ?? resolveContextMenuSelection(menu.surfaceRef.current, menu.preservedSelectionRef.current);
    if (!selection?.selectionText || !args.nodeId || savingRef.current) return false;
    savingRef.current = true;
    const anchorId = `pdf-${crypto.randomUUID()}`;
    const anchorLink = {
      id: anchorId,
      kind: kind === 'cloze' ? ('cloze' as const) : ('highlight' as const),
      locator: selection.locator
    };
    try {
      if (kind === 'highlight') {
        finishCreation(await args.onCreateHighlightFromSelection?.(selection.selectionText, selection.locator) ?? false);
      } else if (kind === 'cloze') {
        finishCreation(Boolean(await createCloze(args.nodeId, '[...]', selection.selectionText, anchorId, anchorLink)));
      } else {
        const content = formatHighlightCardContent({
          note,
          notePrefix: getHighlightAnnotationPrefix(),
          text: selection.selectionText
        });
        finishCreation(Boolean(await createHighlight(args.nodeId, content, anchorId, anchorLink)));
      }
      return true;
    } finally { savingRef.current = false; }
  };
  const requestAnnotation = (kind: PdfSelectionAnnotationKind) => {
    const selection = resolvePdfSelectionSnapshot(menu.surfaceRef.current) ?? menu.selectionMenuState;
    if (selection) {
      menu.openSelectionToolbar(selection, normalizeContextMenuPosition(window.innerWidth / 2, window.innerHeight / 3));
      if (kind === 'note') menu.setNoteOpen(true);
      else void applySelectionAnnotation(kind);
      return true;
    }
    setPdfVisualSelectionKind(kind);
    return true;
  };
  return { applySelectionAnnotation, requestAnnotation };
}

export function usePdfSelectionContextMenu(args: { nodeId: string | null; onCreateHighlightFromSelection: ((selectionText: string, locator: PdfSelectionLocator) => boolean | Promise<boolean>) | undefined }) {
  const menu = usePdfSelectionMenuState(args.nodeId);
  const annotations = usePdfSelectionAnnotationActions({ ...args, menu });

  return {
    ...menu,
    handleCreateCloze: () => annotations.applySelectionAnnotation('cloze'),
    handleCreateHighlight: () => annotations.applySelectionAnnotation('highlight'),
    handleCreateNote: () => annotations.applySelectionAnnotation('note', menu.noteDraft.trim()),
    requestAnnotation: annotations.requestAnnotation
  };
}

export function PdfSelectionContextMenu({
  onCreateHighlight,
  onCreateCloze,
  onCreateNote,
  noteDraft,
  noteOpen,
  setNoteDraft,
  setNoteOpen,
  state
}: {
  onCreateHighlight: () => void;
  onCreateCloze: () => void;
  onCreateNote: () => void;
  noteDraft: string;
  noteOpen: boolean;
  setNoteDraft: (value: string) => void;
  setNoteOpen: (open: boolean) => void;
  state: { left: number; top: number } | null;
}) {
  const t = useTranslation();
  if (!state) {
    return null;
  }

  return createPortal(
    <>
      <div className="fixed z-floating" data-annotation-toolbar="true" onContextMenu={(event) => event.preventDefault()} onPointerDown={(event) => event.stopPropagation()} style={{ left: state.left, top: state.top }}>
        <div className={cn(appFloatingSurfaceClassName('popover'), 'flex items-center gap-1 px-1.5 py-1')} role="toolbar" style={{ opacity: 'var(--app-selection-toolbar-opacity)' }}>
          <AnnotationToolbarButton label={t('desktop.pdf.selection.highlight')} onClick={onCreateHighlight}>
            <Highlighter aria-hidden="true" size={19} strokeWidth={2} />
          </AnnotationToolbarButton>
          <AnnotationToolbarButton label={t('desktop.command.annotateSelection')} onClick={() => setNoteOpen(true)}>
            <MessageSquare aria-hidden="true" size={19} strokeWidth={2} />
          </AnnotationToolbarButton>
          <AnnotationToolbarButton label={t('desktop.command.clozeSelection')} onClick={onCreateCloze}>
            <SquaresSubtract aria-hidden="true" size={19} strokeWidth={2} />
          </AnnotationToolbarButton>
        </div>
      </div>
      {noteOpen ? <AnnotationNotePanel draft={noteDraft} left={state.left} onCancel={() => setNoteOpen(false)} onChange={setNoteDraft} onSave={onCreateNote} top={state.top + 42} /> : null}
    </>,
    document.body
  );
}
