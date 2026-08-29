import type { Node } from '../../features/nodes/model/nodeTypes';

import { resolveWholeImageExistingExcerpt } from './existingExcerptTarget';
import { resolvePdfExistingHighlight } from './pdfExistingHighlightTarget';
import type { EditorContextMenuState } from './useEditorContextCommandHelpers';

interface ExistingExcerptToolbarArgs {
  activeNodeId: string | null;
  nodesById: Record<string, Node>;
  setContextMenu: (value: EditorContextMenuState | null) => void;
  trashedNodeIds: string[];
}

export function resolveSelectionToolbarPosition(event: MouseEvent, targetElement?: Element | null) {
  const targetRect = targetElement?.getBoundingClientRect();
  const selection = window.getSelection();
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  const rect = targetRect ?? range?.getBoundingClientRect();
  const anchor = { left: event.clientX, top: rect?.height ? rect.top : event.clientY };
  return {
    left: Math.max(8, Math.min(anchor.left - 22, window.innerWidth - 158)),
    notePanelLeft: Math.max(8, Math.min(anchor.left - 120, window.innerWidth - 248)),
    notePanelTop: Math.max(8, (rect?.bottom ?? event.clientY) + 8),
    top: Math.max(8, anchor.top - 46)
  };
}

function openResolvedExcerpt(
  args: ExistingExcerptToolbarArgs,
  event: MouseEvent,
  target: HTMLElement,
  match: ReturnType<typeof resolvePdfExistingHighlight>
) {
  if (!match) return false;
  const position = resolveSelectionToolbarPosition(event, target);
  target.classList.add('cm-md-highlight-active');
  args.setContextMenu({
    canRunCommands: true,
    existingHighlight: match,
    kind: 'selection',
    left: position.left,
    mode: 'existing-highlight-toolbar',
    notePanelLeft: position.notePanelLeft,
    notePanelTop: position.notePanelTop,
    payload: null,
    top: position.top
  });
  return true;
}

export function openPdfExcerptToolbar(args: ExistingExcerptToolbarArgs, event: MouseEvent, target: HTMLElement) {
  return openResolvedExcerpt(args, event, target, resolvePdfExistingHighlight({
    activeNodeId: args.activeNodeId ?? '',
    nodesById: args.nodesById,
    target,
    trashedNodeIds: args.trashedNodeIds
  }));
}

export function openWholeImageExcerptToolbar(args: ExistingExcerptToolbarArgs, event: MouseEvent, target: HTMLElement) {
  return openResolvedExcerpt(args, event, target, resolveWholeImageExistingExcerpt({
    activeNodeId: args.activeNodeId ?? '',
    nodesById: args.nodesById,
    target,
    trashedNodeIds: args.trashedNodeIds
  }));
}
