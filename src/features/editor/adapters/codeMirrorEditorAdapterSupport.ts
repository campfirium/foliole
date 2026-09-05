import { Compartment, EditorState, type StateEffect } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';

import { collectMarkdownImageReferences, parseMarkdownImageTarget } from '../../../../lib/core/import/markdownImageReferences';
import type { ExternalLinkOpenRequest } from '../../../shared/platform/externalLinkOpenRequest';
import type { ClipboardAnchorRange } from '../model/anchorClipboardPayload';
import type { EditorNodeLinkPreviewRequest } from '../model/nodeLinkPreview';
import { shouldAutoLocalizeRemoteImages } from '../model/remoteImageLocalizationSetting';

import type { EditorContentChangeMeta, EditorMissingAttachmentResourceHandler, EditorTextAnchorDecoration } from './EditorAdapter';
import { createLiveMarkdownStateExtensions } from './liveMarkdownState';
import { localizeRemoteMarkdownImages } from './localizeRemoteMarkdownImages';
import { hasLocalizedImageOnlyRemoteWrappingLink } from './markdownImageWrappingLinks';

export interface CodeMirrorEditorAdapterOptions {
  applicationCutEnabled?: boolean;
  textAnchorDecorations?: readonly EditorTextAnchorDecoration[];
  hideTitleHeading?: boolean;
  initialContent: string;
  liveMarkdownEnabled?: boolean;
  localDocumentPath?: string | null;
  onChange?: (content: string, meta?: EditorContentChangeMeta) => void;
  onDocumentInput?: (meta: EditorDocumentChangeMeta) => void;
  onMissingAttachmentResource?: EditorMissingAttachmentResourceHandler;
  onOpenExternalLink?: (request: ExternalLinkOpenRequest) => void;
  onOpenNodeLink?: (title: string) => void;
  onPreviewNodeLink?: (request: EditorNodeLinkPreviewRequest | null) => void;
  onPastedAnchors?: (payload: { anchors: ClipboardAnchorRange[]; content: string; nodeId: string }) => void;
  onRedo?: () => boolean;
  onUndo?: () => boolean;
  readOnly?: boolean;
  readOnlyInteractionMode?: 'editor' | 'document';
  trailingDivider?: boolean;
}

export interface EditorDocumentChangeMeta extends EditorContentChangeMeta {
  isComposing: boolean;
}

export function createLiveMarkdownReconfigureEffect(args: {
  compartment: Compartment;
  textAnchorDecorations: readonly EditorTextAnchorDecoration[];
  hideTitleHeading: boolean;
  imageClozePresentationVersion: number;
  localDocumentPath?: string | null;
  nodeId: string | null;
  onMissingAttachmentResource?: EditorMissingAttachmentResourceHandler | null;
  onOpenExternalLink?: ((request: ExternalLinkOpenRequest) => void) | null;
  onOpenNodeLink: ((title: string) => void) | null;
  onPreviewNodeLink?: ((request: EditorNodeLinkPreviewRequest | null) => void) | null;
  onPastedAnchors?: ((payload: { anchors: ClipboardAnchorRange[]; content: string; nodeId: string }) => void) | null;
}) {
  return args.compartment.reconfigure(
    createLiveMarkdownStateExtensions({
      textAnchorDecorations: args.textAnchorDecorations,
      hideTitleHeading: args.hideTitleHeading,
      imageClozePresentationVersion: args.imageClozePresentationVersion,
      localDocumentPath: args.localDocumentPath ?? null,
      nodeId: args.nodeId,
      onMissingAttachmentResource: args.onMissingAttachmentResource ?? null,
      onOpenExternalLink: args.onOpenExternalLink ?? null,
      onOpenNodeLink: args.onOpenNodeLink,
      onPreviewNodeLink: args.onPreviewNodeLink ?? null,
      onPastedAnchors: args.onPastedAnchors ?? null
    })
  );
}

export function createEmptyDecorationsEffect(compartment: Compartment) {
  return compartment.reconfigure(EditorView.decorations.of(Decoration.none));
}

function createReadOnlyReconfigureEffect(compartment: Compartment, readOnly: boolean): StateEffect<unknown> {
  return compartment.reconfigure(createReadOnlyExtensions(readOnly));
}

export function createReadOnlyExtensions(readOnly: boolean) {
  return [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)];
}

function hasLocalizableMarkdownImageContent(content: string) {
  const hasRemoteMarkdownImage = collectMarkdownImageReferences(content).some((reference) => {
    const parsed = parseMarkdownImageTarget(reference.rawTarget);
    return parsed?.destination.startsWith('http://') || parsed?.destination.startsWith('https://');
  });
  return hasRemoteMarkdownImage || hasLocalizedImageOnlyRemoteWrappingLink(content);
}

export function dispatchLiveMarkdownReconfigure(args: {
  compartment: Compartment;
  textAnchorDecorations: readonly EditorTextAnchorDecoration[];
  hideTitleHeading: boolean;
  imageClozePresentationVersion: number;
  localDocumentPath?: string | null;
  nodeId: string | null;
  onMissingAttachmentResource?: EditorMissingAttachmentResourceHandler | null;
  onOpenExternalLink?: ((request: ExternalLinkOpenRequest) => void) | null;
  onOpenNodeLink: ((title: string) => void) | null;
  onPreviewNodeLink?: ((request: EditorNodeLinkPreviewRequest | null) => void) | null;
  onPastedAnchors?: ((payload: { anchors: ClipboardAnchorRange[]; content: string; nodeId: string }) => void) | null;
  view: EditorView;
}) {
  args.view.dispatch({
    effects: createLiveMarkdownReconfigureEffect({
      compartment: args.compartment,
      textAnchorDecorations: args.textAnchorDecorations,
      hideTitleHeading: args.hideTitleHeading,
      imageClozePresentationVersion: args.imageClozePresentationVersion,
      localDocumentPath: args.localDocumentPath ?? null,
      nodeId: args.nodeId,
      onMissingAttachmentResource: args.onMissingAttachmentResource ?? null,
      onOpenExternalLink: args.onOpenExternalLink ?? null,
      onOpenNodeLink: args.onOpenNodeLink,
      onPreviewNodeLink: args.onPreviewNodeLink ?? null,
      onPastedAnchors: args.onPastedAnchors ?? null
    })
  });
}

export function dispatchReadOnlyReconfigure(args: {
  compartment: Compartment;
  readOnly: boolean;
  view: EditorView;
}) {
  args.view.dispatch({
    effects: createReadOnlyReconfigureEffect(args.compartment, args.readOnly)
  });
}

export class RemoteImageLocalizationController {
  private localizationRunId = 0;
  private localizationTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly args: {
      applyLocalizedContent: (localized: string, contentSnapshot: string) => void;
      getContent: () => string;
      getNodeId: () => string | null;
    }
  ) {}

  destroy() {
    if (!this.localizationTimer) {
      return;
    }
    clearTimeout(this.localizationTimer);
    this.localizationTimer = null;
  }

  schedule() {
    this.destroy();
    const nodeId = this.args.getNodeId();
    if (!nodeId) {
      return;
    }

    const currentContent = this.args.getContent();
    if (!hasLocalizableMarkdownImageContent(currentContent)) {
      return;
    }
    if (!shouldAutoLocalizeRemoteImages()) {
      return;
    }

    const runId = ++this.localizationRunId;
    this.localizationTimer = setTimeout(() => {
      this.localizationTimer = null;
      void this.run(runId, nodeId, currentContent);
    }, 180);
  }

  private async run(runId: number, nodeId: string, contentSnapshot: string) {
    if (runId !== this.localizationRunId || !shouldAutoLocalizeRemoteImages()) {
      return;
    }
    const localized = await localizeRemoteMarkdownImages(nodeId, contentSnapshot);
    if (runId !== this.localizationRunId || localized === contentSnapshot || this.args.getContent() !== contentSnapshot) {
      return;
    }
    this.args.applyLocalizedContent(localized, contentSnapshot);
  }
}
