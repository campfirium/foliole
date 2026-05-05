import { Facet, type Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import type { ClipboardAnchorRange } from '../model/anchorClipboardPayload';

import {
  EMPTY_EDITOR_TEXT_ANCHOR_PRESENTATION,
  type EditorTextAnchorPresentation
} from './EditorAdapter';

export const hideTitleHeadingFacet = Facet.define<boolean, boolean>({
  combine: (values) => values[0] ?? false
});

export const activeNodeIdFacet = Facet.define<string | null, string | null>({
  combine: (values) => values[0] ?? null
});

export const imageClozePresentationVersionFacet = Facet.define<number, number>({
  combine: (values) => values[0] ?? 0
});

export const textAnchorPresentationFacet = Facet.define<EditorTextAnchorPresentation, EditorTextAnchorPresentation>({
  combine: (values) => values[0] ?? EMPTY_EDITOR_TEXT_ANCHOR_PRESENTATION
});

export const openNodeLinkFacet = Facet.define<((title: string) => void) | null, ((title: string) => void) | null>({
  combine: (values) => values[0] ?? null
});

export const pastedAnchorsFacet = Facet.define<
  ((payload: { anchors: ClipboardAnchorRange[]; content: string; nodeId: string }) => void) | null,
  ((payload: { anchors: ClipboardAnchorRange[]; content: string; nodeId: string }) => void) | null
>({
  combine: (values) => values[0] ?? null
});

export function createLiveMarkdownStateExtensions(args: {
  textAnchorPresentation: EditorTextAnchorPresentation;
  hideTitleHeading: boolean;
  imageClozePresentationVersion: number;
  nodeId: string | null;
  onOpenNodeLink: ((title: string) => void) | null;
  onPastedAnchors?: ((payload: { anchors: ClipboardAnchorRange[]; content: string; nodeId: string }) => void) | null;
}): Extension[] {
  return [
    hideTitleHeadingFacet.of(args.hideTitleHeading),
    activeNodeIdFacet.of(args.nodeId),
    imageClozePresentationVersionFacet.of(args.imageClozePresentationVersion),
    textAnchorPresentationFacet.of(args.textAnchorPresentation),
    openNodeLinkFacet.of(args.onOpenNodeLink),
    pastedAnchorsFacet.of(args.onPastedAnchors ?? null)
  ];
}

export function getTextAnchorPresentation(value: EditorView | { facet: EditorView['state']['facet'] }) {
  if ('state' in value) {
    return value.state.facet(textAnchorPresentationFacet) ?? EMPTY_EDITOR_TEXT_ANCHOR_PRESENTATION;
  }
  return value.facet(textAnchorPresentationFacet) ?? EMPTY_EDITOR_TEXT_ANCHOR_PRESENTATION;
}

export function getHiddenInlineAnchorKeys(value: EditorView | { facet: EditorView['state']['facet'] }) {
  return getTextAnchorPresentation(value).inlineAnchorCompatibility.hiddenKeys;
}
