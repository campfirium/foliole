import { Facet, type Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import type { ExternalLinkOpenRequest } from '../../../shared/platform/externalLinkOpenRequest';
import type { ClipboardAnchorRange } from '../model/anchorClipboardPayload';
import type { EditorNodeLinkPreviewRequest } from '../model/nodeLinkPreview';

import {
  EMPTY_EDITOR_TEXT_ANCHOR_DECORATIONS,
  type EditorTextAnchorDecoration
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

export const textAnchorDecorationsFacet = Facet.define<
  readonly EditorTextAnchorDecoration[],
  readonly EditorTextAnchorDecoration[]
>({
  combine: (values) => values[0] ?? EMPTY_EDITOR_TEXT_ANCHOR_DECORATIONS
});

export const openNodeLinkFacet = Facet.define<((title: string) => void) | null, ((title: string) => void) | null>({
  combine: (values) => values[0] ?? null
});

export const openExternalLinkFacet = Facet.define<
  ((request: ExternalLinkOpenRequest) => void) | null,
  ((request: ExternalLinkOpenRequest) => void) | null
>({
  combine: (values) => values[0] ?? null
});

export const previewNodeLinkFacet = Facet.define<
  ((request: EditorNodeLinkPreviewRequest | null) => void) | null,
  ((request: EditorNodeLinkPreviewRequest | null) => void) | null
>({
  combine: (values) => values[0] ?? null
});

export const pastedAnchorsFacet = Facet.define<
  ((payload: { anchors: ClipboardAnchorRange[]; content: string; nodeId: string }) => void) | null,
  ((payload: { anchors: ClipboardAnchorRange[]; content: string; nodeId: string }) => void) | null
>({
  combine: (values) => values[0] ?? null
});

export function createLiveMarkdownStateExtensions(args: {
  textAnchorDecorations: readonly EditorTextAnchorDecoration[];
  hideTitleHeading: boolean;
  imageClozePresentationVersion: number;
  nodeId: string | null;
  onOpenExternalLink?: ((request: ExternalLinkOpenRequest) => void) | null;
  onOpenNodeLink: ((title: string) => void) | null;
  onPreviewNodeLink?: ((request: EditorNodeLinkPreviewRequest | null) => void) | null;
  onPastedAnchors?: ((payload: { anchors: ClipboardAnchorRange[]; content: string; nodeId: string }) => void) | null;
}): Extension[] {
  return [
    hideTitleHeadingFacet.of(args.hideTitleHeading),
    activeNodeIdFacet.of(args.nodeId),
    imageClozePresentationVersionFacet.of(args.imageClozePresentationVersion),
    textAnchorDecorationsFacet.of(args.textAnchorDecorations),
    openExternalLinkFacet.of(args.onOpenExternalLink ?? null),
    openNodeLinkFacet.of(args.onOpenNodeLink),
    previewNodeLinkFacet.of(args.onPreviewNodeLink ?? null),
    pastedAnchorsFacet.of(args.onPastedAnchors ?? null)
  ];
}

export function getTextAnchorDecorations(value: EditorView | { facet: EditorView['state']['facet'] }) {
  if ('state' in value) {
    return value.state.facet(textAnchorDecorationsFacet) ?? EMPTY_EDITOR_TEXT_ANCHOR_DECORATIONS;
  }
  return value.facet(textAnchorDecorationsFacet) ?? EMPTY_EDITOR_TEXT_ANCHOR_DECORATIONS;
}
