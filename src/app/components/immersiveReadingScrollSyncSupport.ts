import type { MutableRefObject } from 'react';

import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';

import { getCurrentApplyingSelection } from './immersiveReadingApplying';
import { getReadingPositionSelection, getViewportReadingSelection } from './immersiveReadingMarker';
import { resolveCurrentParagraphSelection } from './immersiveReadingModel';
import type { WorkspaceLayoutProps } from './WorkspaceLayout';

export function resolveStoredReadingSelection(props: WorkspaceLayoutProps) {
  const applyingSelection = getCurrentApplyingSelection(props);
  if (applyingSelection) {
    return applyingSelection;
  }
  const runtimeSelection = props.getReadingPositionSelection();
  if (runtimeSelection) {
    return runtimeSelection;
  }
  const editor = props.editorAdapterRef.current;
  if (!editor) {
    return getReadingPositionSelection(props, { from: 0, to: 0 });
  }
  return getReadingPositionSelection(props, editor.getSelection());
}

export function shouldIgnoreWhitespaceViewportSample(
  editor: NonNullable<WorkspaceLayoutProps['editorAdapterRef']['current']>,
  selection: EditorSelection
) {
  const currentSelection = editor.getSelection();
  if (currentSelection.from === currentSelection.to || selection.from !== selection.to) {
    return false;
  }
  const content = editor.getContent();
  const currentParagraph = resolveCurrentParagraphSelection(content, currentSelection);
  if (
    !currentParagraph ||
    currentParagraph.from !== currentSelection.from ||
    currentParagraph.to !== currentSelection.to
  ) {
    return false;
  }
  const sampledCharacter = content[selection.from] ?? '\n';
  if (sampledCharacter.trim().length === 0) {
    return true;
  }
  return selection.from < currentParagraph.from || selection.to > currentParagraph.to;
}

export function commitReadingSelectionUpdate(args: {
  props: WorkspaceLayoutProps;
  readingSelectionRef: MutableRefObject<{ from: number; to: number }>;
  selection: { from: number; to: number };
  source: string;
}) {
  const applyingSelection = getCurrentApplyingSelection(args.props);
  if (
    applyingSelection &&
    (applyingSelection.from !== args.selection.from || applyingSelection.to !== args.selection.to)
  ) {
    return false;
  }
  args.readingSelectionRef.current = args.selection;
  args.props.setReadingPositionSelection(args.selection);
  return true;
}

export function captureReadingSelection(args: {
  pendingSelectionRef: MutableRefObject<{ from: number; to: number } | null>;
  props: WorkspaceLayoutProps;
  readingSelectionRef: MutableRefObject<{ from: number; to: number }>;
}) {
  const selection = getViewportReadingSelection(args.props);
  if (!selection) {
    return;
  }
  commitReadingSelectionUpdate({
    props: args.props,
    readingSelectionRef: args.readingSelectionRef,
    selection,
    source: 'capture-viewport'
  });
  args.pendingSelectionRef.current = selection;
}
