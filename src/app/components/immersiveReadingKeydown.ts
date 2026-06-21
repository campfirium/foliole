import { isImmersiveEditableElement, isImmersiveEscapeKey } from './immersiveReadingKeyboard';
import type { ImmersiveKeydownSource } from './immersiveReadingKeydownTypes';
import { blurImmersiveActiveElement, clearParagraphMarker } from './immersiveReadingMarker';
import { resolveCurrentParagraphSelection, resolveParagraphSelection } from './immersiveReadingModel';
import { openAdjacentReadableNode } from './immersiveReadingNodes';
import { runImmersiveSelectionAction } from './immersiveReadingSelectionActions';
import { handleImmersiveToggleKey } from './immersiveReadingToggleKey';
import { revealSelectionForImmersiveBand, shouldRevealSelectionInImmersiveBand } from './immersiveReadingViewportBand';

function handleImmersiveExit(args: {
  isImmersiveEditing: boolean;
  props: ImmersiveKeydownSource;
  setIsImmersiveEditing: (value: boolean) => void;
}) {
  const { props, isImmersiveEditing, setIsImmersiveEditing } = args;
  if (isImmersiveEditing) {
    clearParagraphMarker(props.editorAdapterRef);
    blurImmersiveActiveElement();
    setIsImmersiveEditing(false);
    return;
  }
  clearParagraphMarker(props.editorAdapterRef);
  props.onExitImmersiveMode();
}

function selectParagraph(args: {
  getReadingSelection: () => { from: number; to: number } | null;
  direction: 'backward' | 'forward';
  markNextProgrammaticScroll: () => void;
  setReadingSelection: (selection: { from: number; to: number }, source?: string) => void;
  props: ImmersiveKeydownSource;
  readableNodeIds: string[];
}) {
  const editor = args.props.editorAdapterRef.current;
  if (!editor) {
    return false;
  }
  const editorSelection = editor.getSelection();
  const readingSelection = args.getReadingSelection();
  const currentSelection =
    editorSelection.from === 0 &&
    editorSelection.to === 0 &&
    readingSelection &&
    (readingSelection.from !== 0 || readingSelection.to !== 0)
      ? readingSelection
      : editorSelection;
  const movementBaseSelection = resolveCurrentParagraphSelection(editor.getContent(), currentSelection) ?? currentSelection;
  const nextSelection = resolveParagraphSelection({
    content: editor.getContent(),
    currentSelection: movementBaseSelection,
    direction: args.direction
  });
  if (nextSelection) {
    const positionSelection = { from: nextSelection.from, to: nextSelection.from };
    args.setReadingSelection(positionSelection, 'immersive-keydown');
    editor.setSelection(positionSelection);
    editor.setParagraphMarker?.(nextSelection);
    if (shouldRevealSelectionInImmersiveBand({
      direction: args.direction,
      props: args.props,
      selection: nextSelection
    })) {
      args.markNextProgrammaticScroll();
      revealSelectionForImmersiveBand({
        direction: args.direction,
        props: args.props,
        selection: positionSelection
      });
    }
    return true;
  }
  editor.setParagraphMarker?.(null);
  openAdjacentReadableNode(args.props, args.readableNodeIds, args.direction);
  return true;
}

function handleImmersivePrimaryKey(args: {
  event: KeyboardEvent;
  isImmersiveEditing: boolean;
  props: ImmersiveKeydownSource;
  setIsImmersiveEditing: (value: boolean) => void;
  setIsShortcutsOverlayOpen: (value: boolean | ((current: boolean) => boolean)) => void;
}) {
  if (args.event.key === 'Escape') {
    args.event.preventDefault();
    args.setIsShortcutsOverlayOpen(false);
    handleImmersiveExit(args);
    return true;
  }
  if (args.event.key === 'Enter') {
    if (!args.props.editorAdapterRef.current) {
      return true;
    }
    args.event.preventDefault();
    clearParagraphMarker(args.props.editorAdapterRef);
    args.setIsImmersiveEditing(true);
    args.setIsShortcutsOverlayOpen(false);
    return true;
  }
  if (args.event.key === '?' || (args.event.key === '/' && args.event.shiftKey)) {
    args.event.preventDefault();
    args.setIsShortcutsOverlayOpen((current) => !current);
    return true;
  }
  return false;
}

function handleImmersiveReadingKey(args: {
  event: KeyboardEvent;
  getReadingSelection: () => { from: number; to: number } | null;
  markNextProgrammaticScroll: () => void;
  props: ImmersiveKeydownSource;
  readableNodeIds: string[];
  setReadingSelection: (selection: { from: number; to: number }, source?: string) => void;
}) {
  const directionKey = args.event.key === 'ArrowUp' || (args.event.key === ' ' && args.event.shiftKey)
    ? 'backward'
    : args.event.key === 'ArrowDown' || args.event.key === ' ' ? 'forward' : null;
  if (directionKey) {
    args.event.preventDefault();
    selectParagraph({
      getReadingSelection: args.getReadingSelection,
      direction: directionKey,
      markNextProgrammaticScroll: args.markNextProgrammaticScroll,
      setReadingSelection: args.setReadingSelection,
      props: args.props,
      readableNodeIds: args.readableNodeIds
    });
    return;
  }
  if (args.event.key.toLowerCase() === 'h') {
    if (runImmersiveSelectionAction({ getReadingSelection: args.getReadingSelection, props: args.props, type: 'highlight' })) {
      args.event.preventDefault();
    }
    return;
  }
  if (
    args.event.key.toLowerCase() === 'n' &&
    runImmersiveSelectionAction({ getReadingSelection: args.getReadingSelection, props: args.props, type: 'note' })
  ) {
    args.event.preventDefault();
  }
}

export function handleImmersiveKeydown(args: {
  canToggleImmersiveMode: boolean;
  captureReadingSelectionFromViewport: () => void;
  event: KeyboardEvent;
  getReadingSelection: () => { from: number; to: number } | null;
  isImmersiveEditing: boolean;
  markNextProgrammaticScroll: () => void;
  props: ImmersiveKeydownSource;
  queueReadingSelectionRestore: () => void;
  readableNodeIds: string[];
  setReadingSelection: (selection: { from: number; to: number }, source?: string) => void;
  setIsImmersiveEditing: (value: boolean) => void;
  setIsShortcutsOverlayOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  suppressNextSelectionRestore: () => void;
}) {
  if (args.event.defaultPrevented || args.event.repeat || args.event.isComposing) {
    return;
  }
  if (handleImmersiveToggleKey(args)) {
    return;
  }
  if (!args.props.isImmersiveMode || args.event.altKey || args.event.ctrlKey || args.event.metaKey) {
    return;
  }
  if (isImmersiveEscapeKey(args.event)) {
    handleImmersivePrimaryKey(args);
    return;
  }
  if (isImmersiveEditableElement(args.event.target)) {
    return;
  }
  if (handleImmersivePrimaryKey(args)) {
    return;
  }
  if (args.isImmersiveEditing) {
    return;
  }
  handleImmersiveReadingKey({
    event: args.event,
    getReadingSelection: args.getReadingSelection,
    markNextProgrammaticScroll: args.markNextProgrammaticScroll,
    props: args.props,
    readableNodeIds: args.readableNodeIds,
    setReadingSelection: args.setReadingSelection
  });
}
