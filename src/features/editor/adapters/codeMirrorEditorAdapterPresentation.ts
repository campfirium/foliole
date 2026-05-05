import type { Compartment } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { syncEditorLiveMarkdownState, syncEditorTextAnchorDecorations } from './codeMirrorEditorAdapterState';
import type { EditorTextAnchorDecoration } from './EditorAdapter';

export function applyAdapterTextAnchorDecorations(args: {
  compartment: Compartment;
  textAnchorDecorations: readonly EditorTextAnchorDecoration[];
  view: EditorView;
}) {
  syncEditorTextAnchorDecorations(args);
}

export function reconfigureAdapterLiveMarkdownState(args: {
  liveMarkdownStateCompartment: Compartment;
  textAnchorDecorations: readonly EditorTextAnchorDecoration[];
  hideTitleHeading: boolean;
  imageClozePresentationVersion: number;
  nodeId: string | null;
  onOpenNodeLink: ((title: string) => void) | null;
  onPastedAnchors?: ((payload: { anchors: import('../model/anchorClipboardPayload').ClipboardAnchorRange[]; content: string; nodeId: string }) => void) | null;
  view: EditorView;
}) {
  syncEditorLiveMarkdownState(args);
}
