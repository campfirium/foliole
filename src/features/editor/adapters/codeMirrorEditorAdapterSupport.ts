import { Compartment, EditorState, type StateEffect } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';

import type { ClipboardAnchorRange } from '../model/anchorClipboardPayload';
import { shouldAutoLocalizeRemoteImages } from '../model/remoteImageLocalizationSetting';

import type { EditorTextAnchorDecoration } from './EditorAdapter';
import { createLiveMarkdownStateExtensions } from './liveMarkdownState';
import { localizeRemoteMarkdownImages } from './localizeRemoteMarkdownImages';

export interface CodeMirrorEditorAdapterOptions {
  textAnchorDecorations?: readonly EditorTextAnchorDecoration[];
  hideTitleHeading?: boolean;
  initialContent: string;
  onChange?: (content: string) => void;
  onOpenNodeLink?: (title: string) => void;
  onPastedAnchors?: (payload: { anchors: ClipboardAnchorRange[]; content: string; nodeId: string }) => void;
  readOnly?: boolean;
}

export interface EditorDocumentChangeMeta {
  isComposing: boolean;
}

export function createLiveMarkdownReconfigureEffect(args: {
  compartment: Compartment;
  textAnchorDecorations: readonly EditorTextAnchorDecoration[];
  hideTitleHeading: boolean;
  imageClozePresentationVersion: number;
  nodeId: string | null;
  onOpenNodeLink: ((title: string) => void) | null;
  onPastedAnchors?: ((payload: { anchors: ClipboardAnchorRange[]; content: string; nodeId: string }) => void) | null;
}) {
  return args.compartment.reconfigure(
    createLiveMarkdownStateExtensions({
      textAnchorDecorations: args.textAnchorDecorations,
      hideTitleHeading: args.hideTitleHeading,
      imageClozePresentationVersion: args.imageClozePresentationVersion,
      nodeId: args.nodeId,
      onOpenNodeLink: args.onOpenNodeLink,
      onPastedAnchors: args.onPastedAnchors ?? null
    })
  );
}

export function createEmptyDecorationsEffect(compartment: Compartment) {
  return compartment.reconfigure(EditorView.decorations.of(Decoration.none));
}

export function createReadOnlyReconfigureEffect(compartment: Compartment, readOnly: boolean): StateEffect<unknown> {
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
  nodeId: string | null;
  onOpenNodeLink: ((title: string) => void) | null;
  onPastedAnchors?: ((payload: { anchors: ClipboardAnchorRange[]; content: string; nodeId: string }) => void) | null;
  view: EditorView;
}) {
  args.view.dispatch({
    effects: createLiveMarkdownReconfigureEffect({
      compartment: args.compartment,
      textAnchorDecorations: args.textAnchorDecorations,
      hideTitleHeading: args.hideTitleHeading,
      imageClozePresentationVersion: args.imageClozePresentationVersion,
      nodeId: args.nodeId,
      onOpenNodeLink: args.onOpenNodeLink,
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
    if (!nodeId || !shouldAutoLocalizeRemoteImages()) {
      return;
    }

    const currentContent = this.args.getContent();
    if (!/!\[[^\]]*\]\((?:<)?https?:\/\//i.test(currentContent)) {
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
