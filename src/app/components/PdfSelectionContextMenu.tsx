import { Highlighter, MessageSquare, SquaresSubtract } from 'lucide-react';
import { useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';

import { formatHighlightCardContent } from '../../../lib/core/annotations/textAnnotationContent';
import { getHighlightAnnotationPrefix } from '../../features/editor/model/highlightAnnotationPrefixSetting';
import type { PdfAnchorLocator } from '../../features/nodes/model/nodeTypes';
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

function usePdfSelectionMenuState() {
  const [noteDraft, setNoteDraft] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [selectionMenuState, setSelectionMenuState] = useState<{
    left: number;
    locator: PdfAnchorLocator;
    selectionText: string;
    top: number;
  } | null>(null);
  const [selectionOverlayLocator, setSelectionOverlayLocator] = useState<PdfAnchorLocator | undefined>(undefined);
  const surfaceRef = useRef<HTMLElement | null>(null);
  const preservedSelectionRef = useRef<PdfSelectionSnapshot | null>(null);
  const closeSelectionMenu = () => {
    setSelectionMenuState(null);
    setSelectionOverlayLocator(undefined);
    setNoteOpen(false);
    setNoteDraft('');
  };
  const openSelectionToolbar = (selection: PdfSelectionSnapshot, position: { left: number; top: number }) => {
    setSelectionMenuState({
      ...position,
      locator: selection.locator,
      selectionText: selection.selectionText
    });
    setSelectionOverlayLocator(selection.locator);
  };
  useTrackPdfSelection(surfaceRef, preservedSelectionRef);
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

function usePdfSelectionAnnotationActions(args: { menu: ReturnType<typeof usePdfSelectionMenuState>; nodeId: string | null; onCreateHighlightFromSelection: ((selectionText: string, locator: PdfAnchorLocator) => boolean) | undefined }) {
  const createHighlight = useWorkspaceStore((state) => state.createHighlightNodeFromSelection);
  const createCloze = useWorkspaceStore((state) => state.createQANodeFromSelection);
  const { menu } = args;
  const finishCreation = (created: boolean) => {
    if (created) {
      window.getSelection()?.removeAllRanges();
      menu.preservedSelectionRef.current = null;
    }
    menu.closeSelectionMenu();
  };
  const applySelectionAnnotation = (kind: PdfSelectionAnnotationKind, note = '') => {
    const selection = menu.selectionMenuState ?? resolveContextMenuSelection(menu.surfaceRef.current, menu.preservedSelectionRef.current);
    if (!selection?.selectionText || !args.nodeId) return false;
    const anchorId = `pdf-${crypto.randomUUID()}`;
    const anchorLink = {
      id: anchorId,
      kind: kind === 'cloze' ? ('cloze' as const) : ('highlight' as const),
      locator: selection.locator
    };
    if (kind === 'highlight') {
      finishCreation(args.onCreateHighlightFromSelection?.(selection.selectionText, selection.locator) ?? false);
    } else if (kind === 'cloze') {
      void createCloze(args.nodeId, '[...]', selection.selectionText, anchorId, anchorLink);
      finishCreation(true);
    } else {
      const content = formatHighlightCardContent({
        note,
        notePrefix: getHighlightAnnotationPrefix(),
        text: selection.selectionText
      });
      void createHighlight(args.nodeId, content, anchorId, anchorLink);
      finishCreation(true);
    }
    return true;
  };
  const requestAnnotation = (kind: PdfSelectionAnnotationKind) => {
    const selection = resolvePdfSelectionSnapshot(menu.surfaceRef.current) ?? menu.selectionMenuState;
    if (selection) {
      menu.openSelectionToolbar(selection, normalizeContextMenuPosition(window.innerWidth / 2, window.innerHeight / 3));
      if (kind === 'note') menu.setNoteOpen(true);
      else applySelectionAnnotation(kind);
      return true;
    }
    setPdfVisualSelectionKind(kind);
    return true;
  };
  return { applySelectionAnnotation, requestAnnotation };
}

export function usePdfSelectionContextMenu(args: { nodeId: string | null; onCreateHighlightFromSelection: ((selectionText: string, locator: PdfAnchorLocator) => boolean) | undefined }) {
  const menu = usePdfSelectionMenuState();
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
