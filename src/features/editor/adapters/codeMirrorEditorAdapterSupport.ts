import { Compartment, EditorState, type StateEffect } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';

import { recoverMissingArticleImage } from '../../../shared/platform/external/articleImageRecovery';
import type { ExternalLinkOpenRequest } from '../../../shared/platform/externalLinkOpenRequest';
import type { ClipboardAnchorRange } from '../model/anchorClipboardPayload';
import type { EditorNodeLinkPreviewRequest } from '../model/nodeLinkPreview';
import { shouldAutoLocalizeRemoteImages } from '../model/remoteImageLocalizationSetting';

import type { EditorContentChangeMeta, EditorMissingAttachmentResourceHandler, EditorTextAnchorDecoration } from './EditorAdapter';
import { createLiveMarkdownStateExtensions } from './liveMarkdownState';
import {
  localizeRemoteMarkdownImageOccurrence,
  localizeRemoteMarkdownImagesWithChanges,
  hasLocalizableMarkdownImageContent,
  type LocalizedImageChange
} from './localizeRemoteMarkdownImages';
import {
  listenForRemoteImageDisplayed,
  listenForRemoteImageLocalization,
  type RemoteImageLocalizationRequest
} from './remoteImageLocalizationEvents';

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
  private localizationFrame: number | null = null;
  private running = false;
  private displayedNodeId: string | null = null;
  private readonly stopDisplayListening: () => void;
  private readonly stopListening: () => void;

  constructor(
    private readonly args: {
      applyLocalizedContent: (localized: string, contentSnapshot: string, changes?: LocalizedImageChange[], retainDisplay?: boolean) => void;
      getContent: () => string;
      getNodeId: () => string | null;
      host?: HTMLElement;
    }
  ) {
    this.stopListening = args.host
      ? listenForRemoteImageLocalization(args.host, (request) => this.handleOccurrenceRequest(request))
      : () => undefined;
    this.stopDisplayListening = args.host
      ? listenForRemoteImageDisplayed(args.host, (nodeId) => this.handleDisplayedImage(nodeId))
      : () => undefined;
  }

  private clearTimer() {
    if (this.localizationTimer) clearTimeout(this.localizationTimer);
    this.localizationTimer = null;
    if (this.localizationFrame !== null) cancelAnimationFrame(this.localizationFrame);
    this.localizationFrame = null;
  }

  destroy() {
    this.clearTimer();
    this.localizationRunId += 1;
    this.stopListening();
    this.stopDisplayListening();
  }

  schedule() {
    this.clearTimer();
    this.localizationRunId += 1;
    const nodeId = this.args.getNodeId();
    if (nodeId !== this.displayedNodeId) this.displayedNodeId = null;
    else if (nodeId && !this.running) this.handleDisplayedImage(nodeId);
  }

  private handleDisplayedImage(nodeId: string) {
    if (nodeId !== this.args.getNodeId() || this.running || this.localizationFrame !== null || this.localizationTimer) return;
    this.displayedNodeId = nodeId;
    if (!shouldAutoLocalizeRemoteImages()) return;
    const contentSnapshot = this.args.getContent();
    if (!hasLocalizableMarkdownImageContent(contentSnapshot)) return;
    const runId = this.localizationRunId;
    this.localizationFrame = requestAnimationFrame(() => {
      this.localizationFrame = null;
      this.localizationTimer = setTimeout(() => {
        this.localizationTimer = null;
        this.running = true;
        void this.run(runId, nodeId, contentSnapshot).catch(() => undefined).finally(() => {
          this.running = false;
          if (runId !== this.localizationRunId && this.displayedNodeId === nodeId) this.handleDisplayedImage(nodeId);
        });
      }, 0);
    });
  }

  private async run(runId: number, nodeId: string, contentSnapshot: string) {
    if (runId !== this.localizationRunId || !shouldAutoLocalizeRemoteImages()) {
      return;
    }
    const localized = await localizeRemoteMarkdownImagesWithChanges(nodeId, contentSnapshot);
    if (runId !== this.localizationRunId || localized.content === contentSnapshot || this.args.getContent() !== contentSnapshot) {
      return;
    }
    this.args.applyLocalizedContent(localized.content, contentSnapshot, localized.changes);
  }

  private handleOccurrenceRequest(request: RemoteImageLocalizationRequest) {
    if (request.nodeId !== this.args.getNodeId()) return;
    request.handled = true;
    const contentSnapshot = this.args.getContent();
    const operation = request.recovery
      ? recoverMissingArticleImage(request.nodeId, request.source, contentSnapshot)
      : localizeRemoteMarkdownImageOccurrence(request.nodeId, contentSnapshot, request);
    void operation
      .then((localized) => {
        if (!localized || this.args.getNodeId() !== request.nodeId || this.args.getContent() !== contentSnapshot) {
          request.resolve(false);
          return;
        }
        this.args.applyLocalizedContent(
          localized.content,
          contentSnapshot,
          'changes' in localized ? localized.changes : undefined,
          false
        );
        request.resolve(true);
      })
      .catch(() => request.resolve(false));
  }
}
