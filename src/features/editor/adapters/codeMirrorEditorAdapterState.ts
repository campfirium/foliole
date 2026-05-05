import type { Compartment } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { applyLiveMarkdownState } from './codeMirrorLiveMarkdownState';
import { applyEditorTextAnchorPresentation } from './codeMirrorTextAnchorPresentation';
import type { EditorTextAnchorPresentation } from './EditorAdapter';

export function syncEditorTextAnchorPresentation(args: {
  compartment: Compartment;
  textAnchorPresentation: EditorTextAnchorPresentation;
  view: EditorView;
}) {
  applyEditorTextAnchorPresentation(args);
}

export function syncEditorLiveMarkdownState(args: {
  liveMarkdownStateCompartment: Compartment;
  textAnchorPresentation: EditorTextAnchorPresentation;
  hideTitleHeading: boolean;
  imageClozePresentationVersion: number;
  nodeId: string | null;
  onOpenNodeLink: ((title: string) => void) | null;
  onPastedAnchors?: ((payload: { anchors: import('../model/anchorClipboardPayload').ClipboardAnchorRange[]; content: string; nodeId: string }) => void) | null;
  view: EditorView;
}) {
  applyLiveMarkdownState(args);
}
