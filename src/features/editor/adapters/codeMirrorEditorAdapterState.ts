import type { Compartment } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { applyLiveMarkdownState } from './codeMirrorLiveMarkdownState';
import { applyEditorTextAnchorDecorations } from './codeMirrorTextAnchorPresentation';
import type { EditorTextAnchorDecoration } from './EditorAdapter';

export function syncEditorTextAnchorDecorations(args: {
  compartment: Compartment;
  textAnchorDecorations: readonly EditorTextAnchorDecoration[];
  view: EditorView;
}) {
  applyEditorTextAnchorDecorations(args);
}

export function syncEditorLiveMarkdownState(args: {
  liveMarkdownStateCompartment: Compartment;
  textAnchorDecorations: readonly EditorTextAnchorDecoration[];
  hideTitleHeading: boolean;
  imageClozePresentationVersion: number;
  nodeId: string | null;
  onOpenNodeLink: ((title: string) => void) | null;
  onPastedAnchors?: ((payload: { anchors: import('../model/anchorClipboardPayload').ClipboardAnchorRange[]; content: string; nodeId: string }) => void) | null;
  view: EditorView;
}) {
  applyLiveMarkdownState(args);
}
